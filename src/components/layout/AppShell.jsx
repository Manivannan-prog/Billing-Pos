import { useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../../lib/auth";
import { isDemoMode, settings as settingsApi } from "../../lib/db";
import { useShop } from "../../lib/shop";
import { useSync } from "../../lib/sync";
import { Badge, Icon } from "../ui";
import { BrandFooter } from "../ui/Brand";

const MAX_LOGO_BYTES = 400 * 1024;

// Every account runs the whole POS. Only user management is vendor-only.
// shopOnly sections belong to a shop's own till. One login is one shop and an
// admin owns none, so the vendor sees only Administration and reaches a shop's
// figures through Users & Access.
const NAV_SECTIONS = [
  {
    heading: "Point of sale",
    shopOnly: true,
    items: [
      { to: "/", label: "Overview", icon: "dashboard", end: true },
      { to: "/billing", label: "Billing", icon: "billing" },
    ],
  },
  {
    heading: "Shop",
    shopOnly: true,
    items: [
      { to: "/reports", label: "Sales Reports", icon: "reports" },
      { to: "/configuration", label: "Configuration", icon: "settings" },
    ],
  },
  {
    heading: "Administration",
    adminOnly: true,
    items: [{ to: "/users", label: "Users & Access", icon: "users", adminOnly: true }],
  },
];

const initials = (name) =>
  String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

const roleLabel = (role) => (role === "admin" ? "Administrator" : "Shop account");

function NavItem({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
          // Taller rows on touch screens so they are comfortable to tap.
          "h-11 md:h-9",
          isActive
            ? "bg-primary-tint text-primary"
            : "text-text-muted hover:bg-surface-2 hover:text-text",
        ].join(" ")
      }
    >
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1 truncate text-left">{item.label}</span>
    </NavLink>
  );
}

/** Shop logo in the sidebar. Tap it to upload or replace the image. */
function ShopIdentity({ settings, onUpload, isUploading, error }) {
  const fileRef = useRef(null);

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title={settings.logo ? "Replace shop logo" : "Upload shop logo"}
          aria-label={settings.logo ? "Replace shop logo" : "Upload shop logo"}
          className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors hover:border-primary/40"
        >
          {settings.logo ? (
            <img src={settings.logo} alt="" className="h-full w-full object-contain p-0.5" />
          ) : (
            <span className="font-display text-[17px] font-semibold text-primary">
              {initials(settings.shopName) || "POS"}
            </span>
          )}

          <span className="absolute inset-0 hidden items-center justify-center bg-[#1f2421]/55 text-white group-hover:flex">
            <Icon name={isUploading ? "clock" : "plus"} className="h-4 w-4" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold leading-tight text-text">
            {settings.shopName || "Your shop"}
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11px] text-text-muted underline-offset-2 hover:text-primary hover:underline"
          >
            {isUploading ? "Uploading…" : settings.logo ? "Change logo" : "Upload logo"}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function SidebarContent({ profile, isAdmin, onNavigate, onSignOut, shop }) {
  return (
    <>
      <ShopIdentity {...shop} />

      <nav className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        {NAV_SECTIONS.filter(
          (section) =>
            (!section.adminOnly || isAdmin) && (!section.shopOnly || !isAdmin),
        ).map((section) => (
          <div key={section.heading} className="mb-4 last:mb-0">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {section.heading}
            </p>
            <div className="space-y-0.5">
              {section.items
                .filter((item) => !item.adminOnly || isAdmin)
                .map((item) => (
                  <NavItem key={item.to} item={item} onNavigate={onNavigate} />
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-white">
            {initials(profile?.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight text-text">
              {profile?.fullName}
            </p>
            <p className="truncate text-[11px] text-text-muted">{roleLabel(profile?.role)}</p>
          </div>
          <button
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * A dot in the topbar. Silent when everything is uploaded and online, because
 * that is the normal state and a till does not need reassuring about it.
 */
function SyncStatus() {
  const { isOnline, pending, isSyncing } = useSync();

  if (isDemoMode) return null;
  if (isOnline && pending === 0 && !isSyncing) return null;

  const tone = !isOnline ? "warning" : "primary";
  const label = !isOnline
    ? pending > 0
      ? `Offline · ${pending} to upload`
      : "Offline"
    : isSyncing
      ? "Syncing…"
      : `${pending} to upload`;

  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * The cases that need more than a dot: a bill the server refused outright, or
 * one that had to be filed under a new number because its own was already
 * taken. Neither fixes itself, so somebody has to be told.
 */
function SyncBanner() {
  const { lastResult, dismissResult } = useSync();
  const failed = lastResult?.failed ?? [];
  const renumbered = lastResult?.renumbered ?? [];
  if (!failed.length && !renumbered.length) return null;

  return (
    <div className="flex items-start gap-2 border-t border-danger/20 bg-danger-tint px-3 py-2 text-[12px] text-danger">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {failed.length > 0 && (
          <p>
            {failed.length} bill{failed.length === 1 ? "" : "s"} could not be uploaded and{" "}
            {failed.length === 1 ? "was" : "were"} removed from the queue:{" "}
            {failed.map((entry) => entry.billNumber || "unknown").join(", ")}. Re-enter{" "}
            {failed.length === 1 ? "it" : "them"} from Billing.
          </p>
        )}
        {renumbered.length > 0 && (
          <p>
            Bill number already used on the server, so saved under a new one:{" "}
            {renumbered.map((entry) => `${entry.from} → ${entry.to}`).join(", ")}. The printed
            receipt shows the old number; reprint it from Sales Reports if needed.
          </p>
        )}
      </div>
      <button onClick={dismissResult} aria-label="Dismiss" className="shrink-0 hover:opacity-70">
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}

function AppShell({ children }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { settings, reload } = useShop();
  const location = useLocation();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [logoError, setLogoError] = useState("");

  const uploadLogo = (file) => {
    setLogoError("");

    if (!file.type.startsWith("image/")) {
      setLogoError("That file is not an image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be under 400 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      setIsUploading(true);
      try {
        await settingsApi.save({ ...settings, logo: reader.result });
        await reload();
      } catch (error) {
        setLogoError(error.message);
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => setLogoError("That image could not be read.");
    reader.readAsDataURL(file);
  };

  const shop = { settings, onUpload: uploadLogo, isUploading, error: logoError };

  const today = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const pageTitle =
    NAV_SECTIONS.flatMap((section) => section.items).find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    )?.label ?? "";

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="print-hidden fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface md:flex">
        <SidebarContent
          profile={profile}
          isAdmin={isAdmin}
          onSignOut={signOut}
          shop={shop}
        />
      </aside>

      {/* Mobile drawer */}
      {isDrawerOpen && (
        <div className="print-hidden md:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-[#1f2421]/40"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-border bg-surface">
            <SidebarContent
              profile={profile}
              isAdmin={isAdmin}
              onNavigate={() => setIsDrawerOpen(false)}
              onSignOut={signOut}
              shop={shop}
            />
          </aside>
        </div>
      )}

      <div className="md:pl-60">
        <header className="print-hidden sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setIsDrawerOpen(true)}
                aria-label="Open navigation"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text transition-colors hover:bg-surface-2 md:hidden"
              >
                <Icon name="menu" className="h-[18px] w-[18px]" />
              </button>

              {/* On phones the topbar carries the page name; the desktop has the sidebar for that. */}
              <span className="truncate font-display text-[15px] font-semibold text-text md:hidden">
                {pageTitle}
              </span>

              {isDemoMode && (
                <span className="hidden lg:block">
                  <Badge tone="warning">Demo mode &middot; not connected to a backend</Badge>
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <SyncStatus />
              <span className="hidden text-[13px] text-text-muted sm:inline">{today}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white md:hidden">
                {initials(profile?.fullName)}
              </span>
            </div>
          </div>

          <SyncBanner />

          {isDemoMode && (
            <div className="border-t border-warning/20 bg-warning-tint px-3 py-1.5 text-center text-[11px] font-medium text-warning lg:hidden">
              Demo mode &middot; data stays in this browser
            </div>
          )}
        </header>

        <main className="mx-auto max-w-[1600px] px-3 pb-24 pt-5 sm:px-6 sm:pt-6 xl:pb-6">
          {children}
          <BrandFooter />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
