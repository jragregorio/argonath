import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

const DEFAULT_CHANNEL_ID = "warden_default";

async function initPushNotifications(): Promise<void> {
  await PushNotifications.removeAllListeners();

  await PushNotifications.addListener("registration", (token) => {
    console.info("[warden-mobile] FCM token:", token.value);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.error("[warden-mobile] Push registration error:", error.error);
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.info("[warden-mobile] Push received:", notification);
  });

  await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      console.info("[warden-mobile] Push action:", action.actionId, action.notification);
    }
  );

  if (Capacitor.getPlatform() === "android") {
    await PushNotifications.createChannel({
      id: DEFAULT_CHANNEL_ID,
      name: "Warden",
      description: "Alerts for extension requests and account activity",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  }

  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === "prompt") {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== "granted") {
    console.warn("[warden-mobile] Push permission not granted:", permStatus.receive);
    return;
  }

  await PushNotifications.register();
}

async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: "#0f172a" });
  await SplashScreen.hide();
  await initPushNotifications();
}

void initNativeShell();

App.addListener("backButton", ({ canGoBack }) => {
  if (canGoBack) {
    window.history.back();
    return;
  }

  void App.exitApp();
});
