// Lock-screen notifications (iPhone home-screen app, iOS 16.4+). A web app cannot show a Live
// Activity, but it can post a notification right away: when a rest starts we post "Descanso até
// 18:42 · próximo: …", so the lock screen tells when to go back. Same tag = replaces the previous.
import { settings, updateSettings } from './settings.js';

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;

/** Must run from a tap (iOS only asks for permission inside a user gesture). */
export async function enableLockNotifications() {
  if (!notificationsSupported()) throw new Error('Este aparelho não permite avisos. No iPhone, adicione o app à Tela de Início primeiro (iOS 16.4+).');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Permissão negada. Libere em Ajustes do iPhone → Notificações → Antares.');
  updateSettings({ lockNotify: true });
}

async function registration() {
  return navigator.serviceWorker.getRegistration();
}

export async function notify(title, body, tag) {
  if (!settings().lockNotify || !notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await registration();
    await reg?.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', silent: true, renotify: false });
  } catch { /* best effort */ }
}

export async function clearNotifications(tag) {
  try {
    const reg = await registration();
    const list = await reg?.getNotifications(tag ? { tag } : undefined);
    list?.forEach((n) => n.close());
  } catch { /* ignore */ }
}
