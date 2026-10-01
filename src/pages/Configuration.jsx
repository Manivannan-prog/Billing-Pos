import { useEffect, useState } from "react";

import { menu as menuApi, settings as settingsApi } from "../lib/db";
import { useShop } from "../lib/shop";
import { formatCurrency } from "../utils/billHelper";
import { checkBridge } from "../utils/receiptPrinter";
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
  Spinner,
  Textarea,
  Toggle,
} from "../components/ui";

const BLANK_ITEM = { name: "", price: "", category: "" };
const MAX_LOGO_BYTES = 400 * 1024;

function Configuration() {
  const { settings, menuItems, reload, isLoading } = useShop();

  const [draft, setDraft] = useState(settings);
  const [draftSource, setDraftSource] = useState(settings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [notice, setNotice] = useState(null);
  const [isBridgeUp, setIsBridgeUp] = useState(null);

  const [itemForm, setItemForm] = useState(BLANK_ITEM);
  const [editingItem, setEditingItem] = useState(null);
  const [itemError, setItemError] = useState("");
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Settings arrive asynchronously and change again after a save. Resetting the
  // draft during render is Reacts documented way to react to that, and avoids
  // the extra paint an effect would cause.
  if (settings !== draftSource) {
    setDraftSource(settings);
    setDraft(settings);
  }

  useEffect(() => {
    checkBridge().then(setIsBridgeUp);
  }, []);

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const saveSettings = async (event) => {
    event.preventDefault();
    setIsSavingSettings(true);
    setNotice(null);
    try {
      await settingsApi.save(draft);
      await reload();
      setNotice({ tone: "success", text: "Shop settings saved." });
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_BYTES) {
      setNotice({
        tone: "danger",
        text: "That logo is over 400 KB. Use a smaller image so receipts stay quick to print.",
      });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => update({ logo: reader.result });
    reader.readAsDataURL(file);
  };

  /* -------------------------------------------------------- menu items -- */

  const openNewItem = () => {
    setEditingItem(null);
    setItemForm(BLANK_ITEM);
    setItemError("");
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setItemForm({ name: item.name, price: String(item.price), category: item.category });
    setItemError("");
  };

  const submitItem = async (event) => {
    event.preventDefault();
    setItemError("");

    if (!itemForm.name.trim()) {
      setItemError("Give the item a name.");
      return;
    }
    if (itemForm.price === "" || Number(itemForm.price) < 0) {
      setItemError("Enter a price of zero or more.");
      return;
    }

    setIsSavingItem(true);
    try {
      const payload = {
        ...editingItem,
        name: itemForm.name.trim(),
        price: Number(itemForm.price),
        category: itemForm.category.trim(),
      };

      if (editingItem) {
        await menuApi.update(payload);
      } else {
        await menuApi.create(payload);
      }

      await reload();
      setItemForm(BLANK_ITEM);
      setEditingItem(null);
      setNotice({ tone: "success", text: `"${payload.name}" saved.` });
    } catch (error) {
      setItemError(error.message);
    } finally {
      setIsSavingItem(false);
    }
  };

  const removeItem = async () => {
    try {
      await menuApi.remove(deleteTarget.id);
      await reload();
      setNotice({ tone: "success", text: `"${deleteTarget.name}" removed from the menu.` });
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    } finally {
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const categories = [...new Set(menuItems.map((item) => item.category).filter(Boolean))];

  return (
    <div>
      <PageHeader title="Configuration" subtitle="Shop identity, tax rules and the menu" />

      {notice && (
        <Alert
          tone={notice.tone}
          icon={notice.tone === "success" ? "check" : "alert"}
          className="mb-5"
        >
          {notice.text}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ------------------------------------------------ shop details -- */}
        <form onSubmit={saveSettings}>
          <Card>
            <CardHeader title="Shop details" subtitle="Printed at the top of every receipt" />
            <div className="space-y-4 px-5 py-5">
              <Field label="Shop name">
                <Input
                  value={draft.shopName}
                  onChange={(event) => update({ shopName: event.target.value })}
                  placeholder="e.g. Greenwhisk Kitchen"
                />
              </Field>

              <Field label="Address">
                <Textarea
                  rows={2}
                  value={draft.address}
                  onChange={(event) => update({ address: event.target.value })}
                  placeholder="Street, city, PIN"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Phone">
                  <Input
                    value={draft.phone}
                    onChange={(event) => update({ phone: event.target.value })}
                    placeholder="+91 …"
                  />
                </Field>
                <Field label="GSTIN">
                  <Input
                    value={draft.gstNumber}
                    onChange={(event) => update({ gstNumber: event.target.value })}
                    placeholder="33ABCDE1234F1Z5"
                  />
                </Field>
              </div>

              <Field label="UPI ID" hint="Shown at the foot of the receipt.">
                <Input
                  value={draft.upiId}
                  onChange={(event) => update({ upiId: event.target.value })}
                  placeholder="shop@upi"
                />
              </Field>

              <Field
                label="Shop logo"
                hint="PNG or JPG under 400 KB. Printed on every receipt and shown in the side menu."
              >
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface-2/50 p-3 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
                    {draft.logo ? (
                      <img src={draft.logo} alt="Shop logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <Icon name="plus" className="h-5 w-5 text-text-muted" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="sr-only"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => document.getElementById("logo-upload")?.click()}
                      >
                        {draft.logo ? "Replace image" : "Choose image"}
                      </Button>
                      {draft.logo && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => update({ logo: "" })}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-muted">
                      {draft.logo
                        ? "Remember to save settings below."
                        : "A square image works best on the receipt roll."}
                    </p>
                  </div>
                </div>
              </Field>
            </div>

            <div className="border-t border-border px-5 py-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Tax & discount
              </h3>

              <div className="space-y-4">
                <Toggle
                  label="Charge GST"
                  hint="Applied to the subtotal of every bill."
                  checked={draft.enableGST}
                  onChange={(value) => update({ enableGST: value })}
                />
                {draft.enableGST && (
                  <Field label="GST percentage">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={draft.gstPercentage}
                      onChange={(event) => update({ gstPercentage: event.target.value })}
                    />
                  </Field>
                )}

                <div className="border-t border-border pt-4">
                  <Toggle
                    label="Apply a standing discount"
                    hint="Deducted from every bill automatically."
                    checked={draft.enableDiscount}
                    onChange={(value) => update({ enableDiscount: value })}
                  />
                </div>
                {draft.enableDiscount && (
                  <Field label="Discount percentage">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={draft.discountPercentage}
                      onChange={(event) => update({ discountPercentage: event.target.value })}
                    />
                  </Field>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-border bg-surface-2/50 px-5 py-3">
              <Button type="submit" disabled={isSavingSettings} icon="check">
                {isSavingSettings ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </Card>

          <Card className="mt-5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[15px] font-semibold">Receipt printer</h3>
                <p className="mt-1 text-[13px] text-text-muted">
                  The local bridge prints silently to the RETSOL RTP-81. When it is not running,
                  receipts fall back to the browser print dialog automatically.
                </p>
              </div>
              {isBridgeUp === null ? (
                <Spinner className="h-4 w-4" />
              ) : isBridgeUp ? (
                <Badge tone="success">Online</Badge>
              ) : (
                <Badge tone="warning">Offline</Badge>
              )}
            </div>
            {isBridgeUp === false && (
              <Alert tone="info" icon="print" className="mt-3">
                Start it on the POS machine with <code>npm run printer-bridge</code>.
              </Alert>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                setIsBridgeUp(null);
                checkBridge().then(setIsBridgeUp);
              }}
            >
              Re-check
            </Button>
          </Card>
        </form>

        {/* --------------------------------------------------- menu items -- */}
        <div>
          <Card>
            <CardHeader
              title={editingItem ? `Edit "${editingItem.name}"` : "Add a menu item"}
              subtitle="These appear as tiles on the billing screen"
              action={
                editingItem && (
                  <Button size="sm" variant="ghost" onClick={openNewItem}>
                    Cancel edit
                  </Button>
                )
              }
            />
            <form onSubmit={submitItem} className="px-5 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
                <Field label="Item name">
                  <Input
                    value={itemForm.name}
                    onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })}
                    placeholder="e.g. Chicken Biriyani"
                  />
                </Field>
                <Field label="Price">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.price}
                    onChange={(event) => setItemForm({ ...itemForm, price: event.target.value })}
                    placeholder="0.00"
                  />
                </Field>
              </div>

              <Field label="Category" hint="Groups the tiles into filter tabs." className="mt-4">
                <Input
                  value={itemForm.category}
                  onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })}
                  placeholder="e.g. Biriyani"
                  list="menu-categories"
                />
                <datalist id="menu-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </Field>

              {itemError && (
                <Alert tone="danger" className="mt-4">
                  {itemError}
                </Alert>
              )}

              <Button type="submit" disabled={isSavingItem} icon={editingItem ? "check" : "plus"} className="mt-4">
                {isSavingItem ? "Saving…" : editingItem ? "Update item" : "Add item"}
              </Button>
            </form>
          </Card>

          <Card className="mt-5">
            <CardHeader
              title="Menu"
              subtitle={`${menuItems.length} item${menuItems.length === 1 ? "" : "s"}`}
            />
            {menuItems.length ? (
              <div className="divide-y divide-border">
                {menuItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-text">{item.name}</p>
                        {item.isFavorite && (
                          <Icon name="star" className="h-3.5 w-3.5 shrink-0 text-accent" fill="currentColor" />
                        )}
                      </div>
                      {item.category && (
                        <p className="mt-0.5 text-[11px] text-text-muted">{item.category}</p>
                      )}
                    </div>
                    <span className="tabular text-[13px] font-semibold text-text">
                      {formatCurrency(item.price)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditItem(item)}
                        aria-label={`Edit ${item.name}`}
                        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
                      >
                        <Icon name="edit" className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        aria-label={`Delete ${item.name}`}
                        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-tint hover:text-danger"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="billing"
                title="No menu items"
                description="Add your first item above to start billing."
              />
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove this item?"
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={removeItem}>
              Remove item
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-muted">
          <strong className="text-text">{deleteTarget?.name}</strong> will stop appearing on the
          billing screen. Past bills that include it are left untouched.
        </p>
      </Modal>
    </div>
  );
}

export default Configuration;
