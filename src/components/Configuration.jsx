import { useState } from "react";
import {
    getSettings,
    saveSettings,
    getMenuItems,
    saveMenuItems,
} from "../utils/storage";


function Configuration() {
    const [settings, setSettings] = useState(
        getSettings()
    ); const [menuItems, setMenuItems] = useState(
        getMenuItems()
    );

    const [newItem, setNewItem] = useState({
        name: "",
        price: "",
        category: "",
    });
    const [editingId, setEditingId] = useState(null);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;

        setSettings({
            ...settings,
            [name]:
                type === "checkbox"
                    ? checked
                    : value,
        });
    };

    const handleSave = () => {
    saveSettings(settings);
    alert("Settings Saved Successfully");
};

const handleLogoUpload = (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
        setSettings({
            ...settings,
            logo: reader.result,
        });
    };

    reader.readAsDataURL(file);
};
    const handleAddMenuItem = () => {

        if (
            !newItem.name ||
            !newItem.price
        ) {
            alert("Enter Item Name and Price");
            return;
        }

        const updatedMenu = [
            ...menuItems,
            {
                id: Date.now(),
                name: newItem.name,
                price: Number(newItem.price),
                category: newItem.category,
            },
        ];

        setMenuItems(updatedMenu);
        saveMenuItems(updatedMenu);

        setNewItem({
            name: "",
            price: "",
            category: "",
        });
    };
    const handleDeleteItem = (id) => {
        const updatedMenu = menuItems.filter(
            (item) => item.id !== id
        );

        setMenuItems(updatedMenu);
        saveMenuItems(updatedMenu);
    };
    const handleEditItem = (item) => {
        setEditingId(item.id);

        setNewItem({
            name: item.name,
            price: item.price,
            category: item.category,
        });
    };
    const handleUpdateItem = () => {
        const updatedMenu = menuItems.map((item) =>
            item.id === editingId
                ? {
                    ...item,
                    name: newItem.name,
                    price: Number(newItem.price),
                    category: newItem.category,
                }
                : item
        );

        setMenuItems(updatedMenu);
        saveMenuItems(updatedMenu);

        setEditingId(null);

        setNewItem({
            name: "",
            price: "",
            category: "",
        });
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-6">
                Configuration
            </h1>

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">

                {/* Shop Information */}

                <div>
                    <h2 className="text-xl font-semibold mb-4">
                        Shop Information
                    </h2>

                    <div className="grid md:grid-cols-2 gap-4">

                        <input
                            type="text"
                            name="shopName"
                            value={settings.shopName}
                            onChange={handleChange}
                            placeholder="Shop Name"
                            className="border p-3 rounded-lg"
                        />

                        <input
                            type="text"
                            name="phone"
                            value={settings.phone}
                            onChange={handleChange}
                            placeholder="Phone"
                            className="border p-3 rounded-lg"
                        />

                        <input
                            type="text"
                            name="gstNumber"
                            value={settings.gstNumber}
                            onChange={handleChange}
                            placeholder="GST Number"
                            className="border p-3 rounded-lg"
                        />

                        <input
                            type="text"
                            name="upiId"
                            value={settings.upiId}
                            onChange={handleChange}
                            placeholder="UPI ID"
                            className="border p-3 rounded-lg"
                        />
                        <div className="mt-4">
                            <label className="block font-medium mb-2">
                                Shop Logo
                            </label>

                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="w-full border p-2 rounded-lg"
                            />
                        </div>
                        {settings.logo && (
                            <div className="mt-4">
                                <img
                                    src={settings.logo}
                                    alt="Shop Logo"
                                    className="h-24 object-contain border rounded-lg p-2"
                                />
                            </div>
                        )}

                    </div>

                    <textarea
                        name="address"
                        value={settings.address}
                        onChange={handleChange}
                        placeholder="Address"
                        className="border p-3 rounded-lg w-full mt-4"
                        rows="3"
                    />
                </div>

                {/* Billing Settings */}

                <div>
                    <h2 className="text-xl font-semibold mb-4">
                        Billing Settings
                    </h2>

                    <div className="space-y-4">

                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                name="enableGST"
                                checked={settings.enableGST}
                                onChange={handleChange}
                            />

                            Enable GST
                        </label>

                        <input
                            type="number"
                            name="gstPercentage"
                            value={settings.gstPercentage}
                            onChange={handleChange}
                            placeholder="GST %"
                            className="border p-3 rounded-lg w-full"
                        />

                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                name="enableDiscount"
                                checked={settings.enableDiscount}
                                onChange={handleChange}
                            />

                            Enable Discount
                        </label>

                        <input
                            type="number"
                            name="discountPercentage"
                            value={settings.discountPercentage}
                            onChange={handleChange}
                            placeholder="Discount %"
                            className="border p-3 rounded-lg w-full"
                        />

                    </div>
                </div>

                <button
                    onClick={handleSave}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
                >
                    Save Settings
                </button>
                <hr className="my-8" />

                <div>
                    <h2 className="text-xl font-semibold mb-4">
                        Menu Management
                    </h2>

                    <div className="grid md:grid-cols-3 gap-4 mb-4">

                        <input
                            type="text"
                            placeholder="Item Name"
                            value={newItem.name}
                            onChange={(e) =>
                                setNewItem({
                                    ...newItem,
                                    name: e.target.value,
                                })
                            }
                            className="border p-3 rounded-lg"
                        />

                        <input
                            type="number"
                            placeholder="Price"
                            value={newItem.price}
                            onChange={(e) =>
                                setNewItem({
                                    ...newItem,
                                    price: e.target.value,
                                })
                            }
                            className="border p-3 rounded-lg"
                        />

                        <input
                            type="text"
                            placeholder="Category"
                            value={newItem.category}
                            onChange={(e) =>
                                setNewItem({
                                    ...newItem,
                                    category: e.target.value,
                                })
                            }
                            className="border p-3 rounded-lg"
                        />

                    </div>

                    <button
                        onClick={
                            editingId
                                ? handleUpdateItem
                                : handleAddMenuItem
                        }
                        className="bg-green-600 text-white px-5 py-2 rounded-lg"
                    >
                        {editingId ? "Update Item" : "Add Item"}
                    </button>

                    <div className="mt-6 space-y-3">

                        {menuItems.map((item) => (
                            <div
                                key={item.id}
                                className="border rounded-lg p-4 flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {item.name}
                                    </p>

                                    <p className="text-sm text-slate-500">
                                        {item.category}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">

                                    <div className="font-bold text-green-600">
                                        ₹{item.price}
                                    </div>
                                    <button
                                        onClick={() => handleEditItem(item)}
                                        className="bg-blue-600 text-white px-3 py-1 rounded"
                                    >
                                        Edit
                                    </button>

                                    <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="bg-red-500 text-white px-3 py-1 rounded"
                                    >
                                        Delete
                                    </button>

                                </div>
                            </div>
                        ))}

                    </div>
                </div>

            </div>
        </div>
    );
}

export default Configuration;