import CryptoKit
import Foundation
import Security
import UserNotifications
import os.log

// Any failure keeps the generic server alert; never log resolved notification content.
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttemptContent: UNMutableNotificationContent?
  private var mailTask: URLSessionDataTask?
  private let log = OSLog(subsystem: "onl.solace.notification-service", category: "nse")

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    lock.lock()
    self.contentHandler = contentHandler
    bestAttemptContent = content
    lock.unlock()

    let userInfo = request.content.userInfo
    switch userInfo["type"] as? String {
    case "event_reminder":
      resolveEventReminder(userInfo: userInfo)
    case "new_mail":
      resolveNewMail(userInfo: userInfo)
    default:
      complete(nil)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let task = mailTask
    lock.unlock()
    task?.cancel()
    complete(nil)
  }

  /// Applies `update` (if any) and delivers the content exactly once.
  private func complete(_ update: ((UNMutableNotificationContent) -> Void)?) {
    lock.lock()
    guard let handler = contentHandler, let content = bestAttemptContent else {
      lock.unlock()
      return
    }
    contentHandler = nil
    update?(content)
    lock.unlock()
    handler(content)
  }

  private func resolveEventReminder(userInfo: [AnyHashable: Any]) {
    guard
      let eventId = userInfo["eventId"] as? String,
      let keyString = SharedKeychain.read(SharedKeychain.notificationKey),
      let keyData = Base64URL.decode(keyString),
      keyData.count == 32
    else {
      complete(nil)
      return
    }
    let key = SymmetricKey(data: keyData)
    let title = (userInfo["enc"] as? String).flatMap {
      try? NotificationTitleCipher.open($0, aad: "notification-title:v1:\(eventId)", key: key)
    }
    if title == nil && userInfo["enc"] != nil {
      os_log("reminder title could not be decrypted", log: log, type: .error)
    }
    let startsAt = Self.startText(userInfo: userInfo, eventId: eventId, key: key)
    complete { content in
      if let title = title {
        content.title = title
      }
      if let startsAt = startsAt {
        content.body = startsAt
      }
    }
  }

  /// The start time from the reminder's due instant plus the sealed lead, so the visible push never carries it.
  private static func startText(
    userInfo: [AnyHashable: Any], eventId: String, key: SymmetricKey
  ) -> String? {
    guard
      let wire = userInfo["encl"] as? String,
      let due = (userInfo["due"] as? NSNumber)?.doubleValue,
      let plain = try? NotificationTitleCipher.open(
        wire, aad: "notification-lead:v1:\(eventId)", key: key),
      let minutes = Int(plain), minutes >= 0
    else {
      return nil
    }
    if minutes == 0 {
      return "Starting now"
    }
    let start = Date(timeIntervalSince1970: due + Double(minutes) * 60)
    // The account's zone and 12/24-hour choice, so the time reads as it does in the app; the device's otherwise.
    let format = SharedKeychain.read(SharedKeychain.reminderFormat).flatMap(ReminderFormat.init(json:))
    let zone = format?.timeZone ?? .current
    let clock = DateFormatter()
    clock.timeZone = zone
    if let template = format?.clockTemplate {
      clock.setLocalizedDateFormatFromTemplate(template)
    } else {
      clock.timeStyle = .short
    }
    var calendar = Calendar.current
    calendar.timeZone = zone
    if calendar.isDateInToday(start) {
      return "Starts at \(clock.string(from: start))"
    }
    let day = DateFormatter()
    day.timeZone = zone
    day.doesRelativeDateFormatting = true
    day.dateStyle = .medium
    return "Starts \(day.string(from: start)) at \(clock.string(from: start))"
  }

  private func resolveNewMail(userInfo: [AnyHashable: Any]) {
    guard
      let emailId = userInfo["emailId"] as? String, !emailId.isEmpty,
      let accountId = userInfo["accountId"] as? String, !accountId.isEmpty,
      let rawAuth = SharedKeychain.read(SharedKeychain.mailAuth),
      let auth = MailAuth(json: rawAuth),
      let request = auth.emailGetRequest(accountId: accountId, emailId: emailId)
    else {
      complete(nil)
      return
    }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.urlCache = nil
    let session = URLSession(configuration: configuration)

    let task = session.dataTask(with: request) { [weak self] data, response, error in
      session.finishTasksAndInvalidate()
      guard let self = self else { return }
      guard
        error == nil,
        let http = response as? HTTPURLResponse, http.statusCode == 200,
        let data = data,
        let summary = EmailSummary(jmapResponse: data)
      else {
        os_log("new mail summary unavailable", log: self.log, type: .error)
        self.complete(nil)
        return
      }
      self.complete { content in
        if let sender = summary.sender {
          content.title = sender
        }
        if let body = summary.subject ?? summary.preview {
          content.body = body
        }
      }
    }
    lock.lock()
    mailTask = task
    lock.unlock()
    task.resume()
  }
}

/// Mirrors packages/e2ee/src/notification-title.ts: "v1."+b64url(iv12)+"."+b64url(ct||tag), AES-256-GCM, AAD naming the purpose.
enum NotificationTitleCipher {
  enum Failure: Error {
    case malformed
  }

  static func open(_ wire: String, aad: String, key: SymmetricKey) throws -> String {
    let parts = wire.split(separator: ".", omittingEmptySubsequences: false)
    guard
      parts.count == 3, parts[0] == "v1",
      let iv = Base64URL.decode(String(parts[1])), iv.count == 12,
      let sealed = Base64URL.decode(String(parts[2])), sealed.count > 16
    else {
      throw Failure.malformed
    }
    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: iv),
      ciphertext: Data(sealed.prefix(sealed.count - 16)),
      tag: Data(sealed.suffix(16)))
    let plaintext = try AES.GCM.open(
      box, using: key, authenticating: Data(aad.utf8))
    guard let value = String(data: plaintext, encoding: .utf8), !value.isEmpty else {
      throw Failure.malformed
    }
    return value
  }
}

enum Base64URL {
  static func decode(_ value: String) -> Data? {
    var base64 = value
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = base64.count % 4
    if remainder > 0 {
      base64.append(String(repeating: "=", count: 4 - remainder))
    }
    return Data(base64Encoded: base64)
  }
}

enum SharedKeychain {
  static let notificationKey = "notification_key"
  static let mailAuth = "mail_auth"
  static let reminderFormat = "reminder_format"

  /// Mirrors expo-secure-store: service "<service>:no-auth", account = key bytes, access group = App Group.
  static func read(_ key: String) -> String? {
    guard
      let group = Bundle.main.object(forInfoDictionaryKey: "SolaceAppGroup") as? String,
      let service = Bundle.main.object(forInfoDictionaryKey: "SolaceKeychainService") as? String
    else {
      return nil
    }
    let account = Data(key.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "\(service):no-auth",
      kSecAttrGeneric as String: account,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data
    else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }
}

/// Mirrors writeNotificationExtensionReminderFormat in packages/native-core/src/lib/notification-extension-store.ts.
struct ReminderFormat {
  let timeZone: TimeZone?
  let clockTemplate: String?

  init?(json: String) {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    self.timeZone = (object["timeZone"] as? String).flatMap { TimeZone(identifier: $0) }
    switch object["timeFormat"] as? String {
    case "12h": self.clockTemplate = "hmma"
    case "24h": self.clockTemplate = "HHmm"
    default: self.clockTemplate = nil
    }
  }
}

struct MailAuth {
  let apiBaseUrl: String
  let cookie: String
  let origin: String?

  init?(json: String) {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let apiBaseUrl = object["apiBaseUrl"] as? String, !apiBaseUrl.isEmpty,
      let cookie = object["cookie"] as? String, !cookie.isEmpty
    else {
      return nil
    }
    self.apiBaseUrl = apiBaseUrl
    self.cookie = cookie
    self.origin = object["origin"] as? String
  }

  func emailGetRequest(accountId: String, emailId: String) -> URLRequest? {
    var base = apiBaseUrl
    while base.hasSuffix("/") {
      base.removeLast()
    }
    guard let url = URL(string: base + "/api/mail/jmap/jmap/") else {
      return nil
    }
    let body: [String: Any] = [
      "using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      "methodCalls": [
        [
          "Email/get",
          [
            "accountId": accountId,
            "ids": [emailId],
            "properties": ["from", "subject", "preview"],
          ],
          "0",
        ]
      ],
    ]
    guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else {
      return nil
    }
    var request = URLRequest(
      url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
    request.httpMethod = "POST"
    request.httpBody = httpBody
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(cookie, forHTTPHeaderField: "Cookie")
    request.setValue("true", forHTTPHeaderField: "x-skip-oauth-proxy")
    if let origin = origin, !origin.isEmpty {
      request.setValue(origin, forHTTPHeaderField: "expo-origin")
    }
    return request
  }
}

struct EmailSummary {
  let sender: String?
  let subject: String?
  let preview: String?

  init?(jmapResponse data: Data) {
    guard
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let responses = root["methodResponses"] as? [[Any]],
      let first = responses.first, first.count >= 2,
      (first[0] as? String) == "Email/get",
      let arguments = first[1] as? [String: Any],
      let list = arguments["list"] as? [[String: Any]],
      let email = list.first
    else {
      return nil
    }
    let from = (email["from"] as? [[String: Any]])?.first
    sender = EmailSummary.nonEmpty(from?["name"] as? String)
      ?? EmailSummary.nonEmpty(from?["email"] as? String)
    subject = EmailSummary.nonEmpty(email["subject"] as? String)
    preview = EmailSummary.nonEmpty(email["preview"] as? String)
  }

  private static func nonEmpty(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty
    else {
      return nil
    }
    return trimmed
  }
}
