import Foundation
import Security

/// Production: fill in the worker URL and token after deploying Backend/tryon-worker.
/// Development: a git-ignored Secrets.plist with FAL_KEY lets your own phone call
/// fal.ai directly. Never ship a build that contains Secrets.plist.
enum TryOnConfig {
    static let workerURL = ""   // e.g. "https://digicloset-tryon.you.workers.dev"
    static let appToken = ""    // same value as the worker's APP_TOKEN secret

    static let devFalKey: String? = {
        guard let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
              let dict = NSDictionary(contentsOf: url),
              let key = dict["FAL_KEY"] as? String, !key.isEmpty else { return nil }
        return key
    }()

    /// A random id for this phone, sent to the worker so try-on limits are per
    /// phone rather than per Wi-Fi network. It identifies nothing else. Kept in the
    /// Keychain (this device only, not synced) so deleting and reinstalling the app
    /// doesn't hand out a fresh set of try-ons.
    static let deviceID: String = {
        if let saved = DeviceKeychain.read() { return saved }
        let made = UserDefaults.standard.string(forKey: "tryonDeviceID") ?? UUID().uuidString
        DeviceKeychain.save(made)
        return made
    }()

    static var usesWorker: Bool { !workerURL.isEmpty && !appToken.isEmpty }
    static var isReady: Bool { usesWorker || devFalKey != nil }
}

private enum DeviceKeychain {
    private static var query: [String: Any] { [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "DigiCloset.tryon",
        kSecAttrAccount as String: "deviceID",
    ] }

    static func read() -> String? {
        var match = query
        match[kSecReturnData as String] = true
        match[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(match as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ id: String) {
        var item = query
        item[kSecValueData as String] = Data(id.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }
}
