// Powtracker Pro in the iPhone app: buying, restoring and checking the monthly subscription with
// StoreKit 2. Every transaction is verified on the device by StoreKit, so there is no server and
// no account. The web side of this bridge is src/lib/store.ts.

import Capacitor
import StoreKit
import UIKit

/// The app's web view, with the subscription bridge attached.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SubscriptionsPlugin())
    }
}

@objc(SubscriptionsPlugin)
public class SubscriptionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SubscriptionsPlugin"
    public let jsName = "Subscriptions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]

    private var productId = "app.powtracker.pro.monthly"
    private var updates: Task<Void, Never>?

    /// Renewals, refunds, and purchases approved or made elsewhere arrive while the app runs.
    override public func load() {
        updates = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                }
                guard let self else { return }
                self.notifyListeners("statusChanged", data: await self.currentStatus())
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    /// Whether a verified subscription or trial is active, and what the App Store offers this person.
    private func currentStatus() async -> [String: Any] {
        var pro = false
        var expires: Any = NSNull()
        for await entitlement in Transaction.currentEntitlements {
            guard case .verified(let transaction) = entitlement,
                  transaction.productID == productId,
                  transaction.revocationDate == nil else { continue }
            if let end = transaction.expirationDate {
                if end < Date() { continue }
                expires = ISO8601DateFormatter().string(from: end)
            }
            pro = true
        }

        var price: Any = NSNull()
        var trialDays = 0
        if let product = try? await Product.products(for: [productId]).first {
            price = product.displayPrice
            if let subscription = product.subscription,
               let offer = subscription.introductoryOffer,
               offer.paymentMode == .freeTrial,
               await subscription.isEligibleForIntroOffer {
                trialDays = Self.days(in: offer.period)
            }
        }
        return ["pro": pro, "price": price, "trialDays": trialDays, "expires": expires]
    }

    private static func days(in period: Product.SubscriptionPeriod) -> Int {
        switch period.unit {
        case .day: return period.value
        case .week: return period.value * 7
        case .month: return period.value * 30
        case .year: return period.value * 365
        @unknown default: return period.value
        }
    }

    private func remember(_ call: CAPPluginCall) {
        if let id = call.getString("productId"), !id.isEmpty {
            productId = id
        }
    }

    @MainActor private var scene: UIWindowScene? {
        bridge?.viewController?.view.window?.windowScene
    }

    @objc func status(_ call: CAPPluginCall) {
        remember(call)
        Task {
            call.resolve(await currentStatus())
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        remember(call)
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Powtracker Pro is not available from the App Store right now. Try again in a moment.")
                    return
                }
                let result: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = await scene {
                    result = try await product.purchase(confirmIn: scene)
                } else {
                    result = try await product.purchase()
                }
                var status: [String: Any]
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("The App Store could not verify the purchase.")
                        return
                    }
                    await transaction.finish()
                    status = await currentStatus()
                case .userCancelled:
                    status = await currentStatus()
                    status["cancelled"] = true
                case .pending:
                    // Ask to Buy, or a payment that needs confirming: it arrives later through Transaction.updates.
                    status = await currentStatus()
                    status["pending"] = true
                @unknown default:
                    status = await currentStatus()
                }
                call.resolve(status)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        remember(call)
        Task {
            do {
                try await AppStore.sync()
                call.resolve(await currentStatus())
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Apple's own sheet for changing or cancelling the subscription.
    @objc func manage(_ call: CAPPluginCall) {
        Task {
            do {
                guard let scene = await scene else {
                    call.reject("The subscription settings could not be opened.")
                    return
                }
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
