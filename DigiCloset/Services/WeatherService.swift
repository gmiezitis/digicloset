import CoreLocation
import Foundation
import Observation

/// Today's weather for the Today screen, from Open-Meteo (free, no account).
/// Location is asked for only when the user taps "Show weather", is coarse,
/// and is rounded to about 10 km before it leaves the phone.
@MainActor
@Observable
final class WeatherService: NSObject, CLLocationManagerDelegate {
    static let shared = WeatherService()

    struct Now: Codable, Equatable {
        var temperature: Int
        var high: Int
        var low: Int
        var code: Int
        var city: String
        var metric: Bool
        var fetched: Date

        var symbol: String {
            switch code {
            case 0: "sun.max"
            case 1, 2: "cloud.sun"
            case 3: "cloud"
            case 45, 48: "cloud.fog"
            case 51...57: "cloud.drizzle"
            case 61...67, 80...82: "cloud.rain"
            case 71...77, 85, 86: "cloud.snow"
            case 95...99: "cloud.bolt.rain"
            default: "cloud"
            }
        }

        /// The day's high in Celsius, for choosing clothes.
        var highCelsius: Double { metric ? Double(high) : (Double(high) - 32) * 5 / 9 }
        var isWet: Bool { (51...67).contains(code) || (80...82).contains(code) || (95...99).contains(code) }
    }

    private(set) var now: Now?
    private(set) var status: CLAuthorizationStatus
    private let manager = CLLocationManager()
    private var metric = true
    private static let cacheKey = "weather.now"

    override init() {
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyReduced
        if let data = UserDefaults.standard.data(forKey: Self.cacheKey),
           let cached = try? JSONDecoder().decode(Now.self, from: data) {
            now = cached
        }
    }

    var canAsk: Bool { status == .notDetermined }
    var isAllowed: Bool { status == .authorizedWhenInUse || status == .authorizedAlways }

    func requestPermission() { manager.requestWhenInUseAuthorization() }

    /// Refreshes at most once an hour, and only if location was allowed.
    func refresh(metric: Bool) {
        self.metric = metric
        guard isAllowed else { return }
        if let now, now.metric == metric, Date.now.timeIntervalSince(now.fetched) < 3600 { return }
        manager.requestLocation()
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.status = status
            if self.isAllowed { self.manager.requestLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in await self.fetch(location) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    private func fetch(_ location: CLLocation) async {
        let lat = (location.coordinate.latitude * 10).rounded() / 10
        let lon = (location.coordinate.longitude * 10).rounded() / 10
        var parts = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        parts.queryItems = [
            .init(name: "latitude", value: String(lat)), .init(name: "longitude", value: String(lon)),
            .init(name: "current", value: "temperature_2m,weather_code"),
            .init(name: "daily", value: "temperature_2m_max,temperature_2m_min"),
            .init(name: "forecast_days", value: "1"), .init(name: "timezone", value: "auto"),
            .init(name: "temperature_unit", value: metric ? "celsius" : "fahrenheit"),
        ]
        guard let url = parts.url,
              let (data, _) = try? await URLSession.shared.data(from: url),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let current = json["current"] as? [String: Any],
              let daily = json["daily"] as? [String: Any],
              let temperature = current["temperature_2m"] as? Double,
              let code = current["weather_code"] as? Int,
              let high = (daily["temperature_2m_max"] as? [Double])?.first,
              let low = (daily["temperature_2m_min"] as? [Double])?.first else { return }
        let city = (try? await CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: lat, longitude: lon)))?.first?.locality ?? ""
        let result = Now(temperature: Int(temperature.rounded()), high: Int(high.rounded()), low: Int(low.rounded()),
                         code: code, city: city, metric: metric, fetched: .now)
        now = result
        if let data = try? JSONEncoder().encode(result) { UserDefaults.standard.set(data, forKey: Self.cacheKey) }
    }
}
