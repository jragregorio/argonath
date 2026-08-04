import { redirect } from "next/navigation";

export default function ExtensionsRedirectPage() {
  redirect("/dashboard/activity");
}
