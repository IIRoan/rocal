import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = ProbeViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

final class ProbeViewController: UIViewController, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let status = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.text = "Ready"
        status.accessibilityIdentifier = "probe-status"
        let stack = UIStackView(arrangedSubviews: [
            button("Open automatic", identifier: "open-automatic", style: .automatic),
            button("Open full screen", identifier: "open-full-screen", style: .fullScreen),
            status,
        ])
        stack.axis = .vertical
        stack.spacing = 24
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func button(_ title: String, identifier: String, style: UIModalPresentationStyle) -> UIButton {
        let button = UIButton(configuration: .filled(), primaryAction: UIAction(title: title) { [weak self] _ in
            self?.openPicker(style)
        })
        button.accessibilityIdentifier = identifier
        return button
    }

    // Mirrors expo-image-picker 58's legacy library path: photoLibrary, images only, editing on, caller-chosen presentation style.
    private func openPicker(_ style: UIModalPresentationStyle) {
        let picker = UIImagePickerController()
        picker.sourceType = .photoLibrary
        picker.mediaTypes = ["public.image"]
        picker.allowsEditing = true
        picker.modalPresentationStyle = style
        picker.delegate = self
        status.text = "Presenting"
        present(picker, animated: true)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { [weak self] in self?.status.text = "Cancelled" }
    }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true) { [weak self] in self?.status.text = "Picked" }
    }
}
