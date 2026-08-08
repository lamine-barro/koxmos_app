let configured = false;

/** Prepare the single, quiet notification channel used by Koxmos. */
export async function configureNotifications() {
  if (configured) return;
  configured = true;
}

/**
 * A local confirmation is reserved for completed actions that matter outside
 * the current screen. Permission is requested only when it is actually useful.
 */
export async function sendLocalNotification(title: string, body: string) {
  void title; void body;
  return false;
}
