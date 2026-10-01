import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ToastHost } from "@/components/Toast";

/**
 * Deliberately bare: no header, no hub switcher, no bottom nav. Someone on
 * their first minute has nothing to navigate to yet, and every exit from the
 * welcome is a choice it makes for them (Skip, or the last step's Finish).
 * The service worker is registered here too, because the notifications step
 * subscribes to push and that waits on a ready registration.
 */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col">
      <ServiceWorkerRegister />
      {children}
      <ToastHost />
    </div>
  );
}
