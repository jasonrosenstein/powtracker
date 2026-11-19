// The iPhone app: the built site (dist/) inside a native shell, with the App Store subscription
// handled natively (ios/App/App/SubscriptionsPlugin.swift).
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.powtracker.ios',
  appName: 'Powtracker',
  webDir: 'dist',
  ios: {
    // The page draws under the status bar and the home indicator itself (safe-area insets in styles.css).
    contentInset: 'never',
    backgroundColor: '#f3f6fa',
  },
}

export default config
