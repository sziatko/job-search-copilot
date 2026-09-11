import { Outlet } from '@tanstack/react-router';

/** The one element every route renders inside. No global chrome yet — each page
 * owns its own full-screen background. A shared nav bar can slot in here later. */
export function RootLayout() {
  return <Outlet />;
}
