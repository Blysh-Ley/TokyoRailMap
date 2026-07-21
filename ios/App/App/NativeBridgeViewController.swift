import UIKit
import WebKit
import Capacitor

private enum NativeBottomNavItem: String, CaseIterable {
    case map
    case menu
    case search
    case settings

    var title: String {
        switch self {
        case .map: return "地图"
        case .menu: return "线路"
        case .search: return "搜索"
        case .settings: return "设置"
        }
    }

    var systemImageName: String {
        switch self {
        case .map: return "map"
        case .menu: return "line.3.horizontal"
        case .search: return "magnifyingglass"
        case .settings: return "gearshape"
        }
    }
}

private enum NativeBottomNavPalette {
    static let text = UIColor(red: 0.078, green: 0.125, blue: 0.169, alpha: 1.0)
    static let line = UIColor(red: 0.851, green: 0.886, blue: 0.918, alpha: 0.82)
    static let accent = UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1.0)
    static let activeFill = UIColor(red: 0.933, green: 0.953, blue: 0.969, alpha: 0.94)
    static let barFill = UIColor.white.withAlphaComponent(0.86)
}

private enum NativeBottomNavMetrics {
    static let hostWidth: CGFloat = 318
    static let hostSideInset: CGFloat = 18
    static let hostHeight: CGFloat = 136
}

private final class NativeBottomTabBarController: UITabBarController, UITabBarControllerDelegate {
    private let onSelect: (NativeBottomNavItem) -> Void

    init(onSelect: @escaping (NativeBottomNavItem) -> Void) {
        self.onSelect = onSelect
        super.init(nibName: nil, bundle: nil)
        setupView()
    }

    required init?(coder: NSCoder) {
        return nil
    }

    func setSelectedItem(_ item: NativeBottomNavItem) {
        guard let index = NativeBottomNavItem.allCases.firstIndex(of: item) else { return }
        selectedIndex = index
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        guard let index = viewControllers?.firstIndex(of: viewController) else { return }
        onSelect(NativeBottomNavItem.allCases[index])
    }

    private func setupView() {
        delegate = self
        view.backgroundColor = .clear
        view.isOpaque = false
        tabBar.tintColor = NativeBottomNavPalette.accent
        tabBar.unselectedItemTintColor = NativeBottomNavPalette.text
        tabBar.backgroundColor = .clear
        tabBar.isTranslucent = true
        tabBar.accessibilityLabel = "Tab Bar"
        tabBar.accessibilityIdentifier = "tokyo-rail-native-tab-bar"

        viewControllers = NativeBottomNavItem.allCases.map { item in
            let viewController = UIViewController()
            viewController.view.backgroundColor = .clear
            viewController.view.isOpaque = false
            viewController.tabBarItem = UITabBarItem(
                title: item.title,
                image: UIImage(systemName: item.systemImageName),
                selectedImage: UIImage(systemName: item.systemImageName)
            )
            viewController.tabBarItem.accessibilityIdentifier = "native-bottom-nav-\(item.rawValue)"
            return viewController
        }
        selectedIndex = 0
    }
}

final class NativeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private let nativeNavHandlerName = "tokyoRailNativeNav"
    private var nativeNavController: NativeBottomTabBarController?
    private var selectedNativeItem: NativeBottomNavItem = .map
    private var didInstallNativeNavScriptBridge = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard shouldUseNativeBottomNav else { return }
        installNativeNavScriptBridge()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard shouldUseNativeBottomNav else { return }
        installNativeTabBar()
    }

    deinit {
        if didInstallNativeNavScriptBridge {
            webView?.configuration.userContentController.removeScriptMessageHandler(forName: nativeNavHandlerName)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == nativeNavHandlerName else { return }
        guard let body = message.body as? [String: Any] else { return }
        let type = String(describing: body["type"] ?? "")
        guard type == "active" || type == "ready" else { return }
        let rawItem = String(describing: body["item"] ?? NativeBottomNavItem.map.rawValue)
        let item = NativeBottomNavItem(rawValue: rawItem) ?? .map
        setNativeNavActive(item, notifyWeb: false)
    }

    private func installNativeNavScriptBridge() {
        guard let userContentController = webView?.configuration.userContentController else { return }
        userContentController.add(self, name: nativeNavHandlerName)
        didInstallNativeNavScriptBridge = true
        userContentController.addUserScript(WKUserScript(
            source: nativeNavBootstrapScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
    }

    private func installNativeTabBar() {
        guard nativeNavController == nil else { return }

        let navController = NativeBottomTabBarController { [weak self] item in
            self?.setNativeNavActive(item, notifyWeb: true)
        }
        navController.view.translatesAutoresizingMaskIntoConstraints = false

        addChild(navController)
        view.addSubview(navController.view)
        navController.didMove(toParent: self)
        nativeNavController = navController

        let width = navController.view.widthAnchor.constraint(equalToConstant: NativeBottomNavMetrics.hostWidth)
        width.priority = .defaultHigh
        NSLayoutConstraint.activate([
            navController.view.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            width,
            navController.view.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: NativeBottomNavMetrics.hostSideInset),
            navController.view.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -NativeBottomNavMetrics.hostSideInset),
            navController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            navController.view.heightAnchor.constraint(equalToConstant: NativeBottomNavMetrics.hostHeight)
        ])
    }

    private func setNativeNavActive(_ item: NativeBottomNavItem, notifyWeb: Bool) {
        selectedNativeItem = item
        nativeNavController?.setSelectedItem(item)
        if notifyWeb {
            dispatchNativeNavSelectionToWeb(item)
        }
    }

    private func dispatchNativeNavSelectionToWeb(_ item: NativeBottomNavItem) {
        let js = """
        window.dispatchEvent(new CustomEvent('tokyoRail:nativeNavSelect', {
            detail: {
                item: '\(item.rawValue)',
                source: 'ios-native-tab-bar',
                ts: Date.now()
            }
        }));
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private var shouldUseNativeBottomNav: Bool {
        if #available(iOS 26.0, *) {
            return true
        }
        return false
    }

    private var nativeNavBootstrapScript: String {
        return """
        (function() {
            var handlerName = 'tokyoRailNativeNav';
            var applyNativeNavFlags = function() {
                try {
                    window.__TOKYO_RAIL_IOS_NATIVE_NAV__ = true;
                    if (document.documentElement && document.documentElement.dataset) {
                        document.documentElement.dataset.iosNativeNav = '1';
                    }
                    if (document.body && document.body.dataset) {
                        document.body.dataset.iosNativeNav = '1';
                    }
                } catch (error) {}
            };
            applyNativeNavFlags();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', applyNativeNavFlags, { once: true });
            }
            window.TokyoRailNativeNav = {
                setActive: function(item) {
                    try {
                        window.webkit.messageHandlers[handlerName].postMessage({
                            type: 'active',
                            item: String(item || 'map')
                        });
                    } catch (error) {}
                }
            };
            try {
                window.webkit.messageHandlers[handlerName].postMessage({ type: 'ready', item: 'map' });
            } catch (error) {}
        })();
        """
    }
}
