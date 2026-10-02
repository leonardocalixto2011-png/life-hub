import { RouteSheet } from "@/components/EditSheet";

/** The sheet itself, in the layout so that loading.tsx and the page share it. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <RouteSheet base="/deadlines/">{children}</RouteSheet>;
}
