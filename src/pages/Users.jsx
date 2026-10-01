import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { users as usersApi, isDemoMode } from "../lib/db";
import { useAuth } from "../lib/auth";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from "../components/ui";

const BLANK_FORM = { username: "", fullName: "", password: "", role: "user" };

/**
 * The name block in each row. A shop account links through to its own data;
 * an admin owns no shop, so there is nothing to open.
 */
function AccountName({ user, isSelf, nameClassName = "" }) {
  const body = (
    <>
      <p className={`truncate font-medium text-text ${nameClassName}`}>
        {user.fullName}
        {isSelf && <span className="ml-1.5 font-normal text-text-muted">(you)</span>}
      </p>
      <p className="truncate text-[11px] text-text-muted">@{user.username}</p>
    </>
  );

  if (user.role !== "user") {
    return <div className="min-w-0 flex-1">{body}</div>;
  }

  return (
    <Link
      to={`/shops/${user.id}`}
      className="group min-w-0 flex-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      title={`View ${user.fullName}'s sales and settings`}
    >
      <span className="block group-hover:underline">{body}</span>
    </Link>
  );
}

function Users() {
  const { profile } = useAuth();

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    try {
      setUsers(await usersApi.list());
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetching on mount is exactly what this effect is for: load() awaits the
    // backend before it touches state, so there is no synchronous cascade. The
    // rule cannot see past the call, hence the narrow exemption.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const createUser = async (event) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      await usersApi.create(form);
      setNotice({ tone: "success", text: `Login created for ${form.username}.` });
      setForm(BLANK_FORM);
      setIsCreateOpen(false);
      load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const applyPatch = async (user, patch, successText) => {
    setNotice(null);
    try {
      await usersApi.update(user.id, patch);
      setNotice({ tone: "success", text: successText });
      load();
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      await usersApi.resetPassword(passwordTarget.id, newPassword);
      setNotice({ tone: "success", text: `Password updated for ${passwordTarget.username}.` });
      setPasswordTarget(null);
      setNewPassword("");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeUser = async () => {
    setIsSaving(true);
    try {
      await usersApi.remove(deleteTarget.id);
      setNotice({ tone: "success", text: `${deleteTarget.username} was removed.` });
      setDeleteTarget(null);
      load();
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
      setDeleteTarget(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Users & access"
        subtitle="Issue a login to a shop that has bought the app. There is no self sign-up."
      >
        <Button
          icon="plus"
          onClick={() => {
            setForm(BLANK_FORM);
            setFormError("");
            setIsCreateOpen(true);
          }}
        >
          Add user
        </Button>
      </PageHeader>

      {notice && (
        <Alert
          tone={notice.tone}
          icon={notice.tone === "success" ? "check" : "alert"}
          className="mb-5"
        >
          {notice.text}
        </Alert>
      )}

      {isDemoMode && (
        <Alert tone="warning" className="mb-5">
          Demo mode: these accounts live in this browser only and passwords are stored in plain
          text. Connect Supabase before issuing real logins.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Accounts"
          subtitle={`${users.length} login${users.length === 1 ? "" : "s"}`}
        />
        {users.length ? (
          <>
          {/* Card per account on phones - the five-column table does not fit. */}
          <div className="divide-y divide-border lg:hidden">
            {users.map((user) => {
              const isSelf = user.id === profile?.id;
              return (
                <div key={user.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-text-muted">
                      {user.username.slice(0, 2).toUpperCase()}
                    </span>
                    <AccountName user={user} isSelf={isSelf} nameClassName="text-[13px]" />
                    {user.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Disabled</Badge>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Select
                      value={user.role}
                      disabled={isSelf}
                      onChange={(event) =>
                        applyPatch(
                          user,
                          { role: event.target.value },
                          `${user.username} is now ${event.target.value === "admin" ? "an admin" : "a shop account"}.`,
                        )
                      }
                      className="h-9 flex-1 text-[12px]"
                    >
                      <option value="user">Shop</option>
                      <option value="admin">Admin</option>
                    </Select>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPasswordTarget(user);
                        setNewPassword("");
                        setFormError("");
                      }}
                    >
                      Password
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isSelf}
                      onClick={() =>
                        applyPatch(
                          user,
                          { isActive: !user.isActive },
                          `${user.username} was ${user.isActive ? "disabled" : "re-enabled"}.`,
                        )
                      }
                    >
                      {user.isActive ? "Disable" : "Enable"}
                    </Button>
                    <button
                      disabled={isSelf}
                      onClick={() => setDeleteTarget(user)}
                      aria-label={`Delete ${user.username}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-40"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">User</th>
                  <th className="px-5 py-2.5 font-semibold">Role</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold">Created</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const isSelf = user.id === profile?.id;
                  return (
                    <tr key={user.id} className="hover:bg-surface-2/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-text-muted">
                            {user.username.slice(0, 2).toUpperCase()}
                          </span>
                          <AccountName user={user} isSelf={isSelf} />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Select
                          value={user.role}
                          disabled={isSelf}
                          onChange={(event) =>
                            applyPatch(
                              user,
                              { role: event.target.value },
                              `${user.username} is now a ${event.target.value}.`,
                            )
                          }
                          className="h-8 w-32 text-[12px]"
                        >
                          <option value="user">Shop</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </td>
                      <td className="px-5 py-3">
                        {user.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="danger">Disabled</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPasswordTarget(user);
                              setNewPassword("");
                              setFormError("");
                            }}
                          >
                            Password
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSelf}
                            onClick={() =>
                              applyPatch(
                                user,
                                { isActive: !user.isActive },
                                `${user.username} was ${user.isActive ? "disabled" : "re-enabled"}.`,
                              )
                            }
                          >
                            {user.isActive ? "Disable" : "Enable"}
                          </Button>
                          <button
                            disabled={isSelf}
                            onClick={() => setDeleteTarget(user)}
                            aria-label={`Delete ${user.username}`}
                            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-tint hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <EmptyState
            icon="users"
            title="No accounts yet"
            description="Create the first login to let someone use the POS."
          />
        )}
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="users" className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">Admin</h3>
          </div>
          <p className="text-[13px] text-text-muted">
            Your own account, for selling and supporting the software. Everything a shop account
            can do, plus issuing, disabling and deleting logins.
          </p>
        </Card>
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="billing" className="h-4 w-4 text-accent" />
            <h3 className="font-display text-[15px] font-semibold">Shop account</h3>
          </div>
          <p className="text-[13px] text-text-muted">
            The whole point of sale: billing, sales reports, Excel export, end-of-sale, prices,
            menu and shop settings. Only this Administration section is withheld.
          </p>
        </Card>
      </div>

      {/* --------------------------------------------------- create modal -- */}
      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add a user"
        subtitle="They sign in with this username and password."
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" disabled={isSaving}>
              {isSaving ? "Creating…" : "Create user"}
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={createUser} className="space-y-4">
          <Field label="Username" hint="Letters, numbers, dot, dash or underscore. 3–30 characters.">
            <Input
              value={form.username}
              onChange={(event) => updateForm({ username: event.target.value })}
              autoCapitalize="none"
              spellCheck="false"
              placeholder="e.g. ravi"
              required
            />
          </Field>

          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={(event) => updateForm({ fullName: event.target.value })}
              placeholder="e.g. Ravi Kumar"
            />
          </Field>

          <Field label="Password" hint="At least 8 characters. Share it with them directly.">
            <Input
              type="text"
              value={form.password}
              onChange={(event) => updateForm({ password: event.target.value })}
              placeholder="At least 8 characters"
              required
            />
          </Field>

          <Field label="Role">
            <Select
              value={form.role}
              onChange={(event) => updateForm({ role: event.target.value })}
            >
              <option value="user">Shop account — full POS, no user management</option>
              <option value="admin">Admin — full POS plus user management</option>
            </Select>
          </Field>

          {formError && <Alert tone="danger">{formError}</Alert>}
        </form>
      </Modal>

      {/* ------------------------------------------------- password modal -- */}
      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title={`Set a new password`}
        subtitle={passwordTarget ? `For @${passwordTarget.username}` : undefined}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="reset-password-form" disabled={isSaving}>
              {isSaving ? "Saving…" : "Update password"}
            </Button>
          </>
        }
      >
        <form id="reset-password-form" onSubmit={resetPassword} className="space-y-4">
          <Field label="New password" hint="At least 8 characters.">
            <Input
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              autoFocus
            />
          </Field>
          {formError && <Alert tone="danger">{formError}</Alert>}
        </form>
      </Modal>

      {/* --------------------------------------------------- delete modal -- */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this login?"
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={removeUser} disabled={isSaving}>
              {isSaving ? "Deleting…" : "Delete user"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-muted">
          <strong className="text-text">@{deleteTarget?.username}</strong> will lose access
          immediately. Bills they already rang up are kept, but stop showing their name.
        </p>
      </Modal>
    </div>
  );
}

export default Users;
