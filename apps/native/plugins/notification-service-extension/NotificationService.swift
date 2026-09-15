import CryptoKit
import Foundation
import Security
import UserNotifications
import os.log

// Replaces the generic APNs alert with content resolved on-device:
//  - event_reminder: decrypts `enc` with the notification key from the shared
//    keychain (title only; the time-based body from the server is kept).
//  - new_mail: fetches sender/subject with JMAP Email/get through the backend
//    proxy using the session credential from the shared keychain.
// Any failure keeps the generic alert. Never log notification content.
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

  // MARK: - Event reminder

  private func resolveEventReminder(userInfo: [AnyHashable: Any]) {
    guard
      let eventId = userInfo["eventId"] as? String,
      let wire = userInfo["enc"] as? String,
      let keyString = SharedKeychain.read(SharedKeychain.notificationKey),
      let keyData = Base64URL.decode(keyString),
      keyData.count == 32
    else {
      complete(nil)
      return
    }

    do {
      let title = try NotificationTitleCipher.open(
        wire, eventId: eventId, key: SymmetricKey(data: keyData))
      complete { content in
        content.title = title
      }
    } catch {
      os_log("reminder title could not be decrypted", log: log, type: .error)
      complete(nil)
    }
  }

  // MARK: - New mail

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

// MARK: - Wire format (keep in sync with packages/e2ee/src/notification-title.ts)

/// "v1." + base64url(12-byte IV) + "." + base64url(ciphertext || 16-byte tag),
/// AES-256-GCM, AAD = UTF-8 "notification-title:v1:<eventId>".
///
/// Fixed vector (packages/e2ee/src/__tests__/notification-title.test.ts):
///   account key      = 00 01 02 ... 1f
///   notification key = HKDF-SHA256(account key, salt 32×00,
///                        info "solace/notification-key/v1", 32)
///                    = base64url "cNL8JZgoDs-eREw6AXrJgoOK9W5TprVEGl7ciJ7hTGg"
///   eventId          = "evt_123"
///   wire             = "v1.oKGio6Slpqeoqaqr.RzKqGz6RlCIjsse98Z5olLmi5f7PQ06_sfA4TvGmoA"
///   plaintext        = "Dentist — 3pm"
enum NotificationTitleCipher {
  enum Failure: Error {
    case malformed
  }

  static func open(_ wire: String, eventId: String, key: SymmetricKey) throws -> String {
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
      box, using: key, authenticating: Data("notification-title:v1:\(eventId)".utf8))
    guard let title = String(data: plaintext, encoding: .utf8), !title.isEmpty else {
      throw Failure.malformed
    }
    return title
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

// MARK: - Shared keychain (written by expo-secure-store in the app)

enum SharedKeychain {
  static let notificationKey = "notification_key"
  static let mailAuth = "mail_auth"

  /// Mirrors expo-secure-store's query: service "<service>:no-auth", account
  /// and generic attributes are the UTF-8 key bytes, access group = App Group.
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

// MARK: - JMAP

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
