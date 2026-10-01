using System.ComponentModel;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;

// The printer can be changed without rebuilding: put its exact Windows name in
// printer.txt next to the executable. That is what lets one build be handed to
// any shop, whatever till roll printer they happen to own.
const string defaultPrinter = "RETSOL RTP-81";
var printerFile = Path.Combine(AppContext.BaseDirectory, "printer.txt");
var printerName = defaultPrinter;

if (File.Exists(printerFile))
{
    var configured = File.ReadAllLines(printerFile)
        .Select(line => line.Trim())
        .FirstOrDefault(line => line.Length > 0 && !line.StartsWith('#'));
    if (!string.IsNullOrWhiteSpace(configured)) printerName = configured;
}
else
{
    // Write it out so a freshly published copy is self-documenting and a
    // rebuild never leaves the shop with no way to change the printer.
    // Best effort: a read-only install folder is not worth failing over.
    try
    {
        File.WriteAllText(printerFile, string.Join(Environment.NewLine,
            "# The exact Windows name of the receipt printer.",
            "# Find it in Settings > Bluetooth & devices > Printers & scanners.",
            "# Change the line below, save, and restart this app.",
            defaultPrinter,
            ""));
    }
    catch (Exception) { /* keep the built-in default */ }
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:9101");
// This window is watched by a shopkeeper, not a developer: keep it to the
// banner below and anything that actually went wrong.
builder.Logging.ClearProviders();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.IsLoopback || (uri.Scheme == Uri.UriSchemeHttps && uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase))))
    .AllowAnyHeader()
    .AllowAnyMethod()));
var app = builder.Build();
var printedSales = new ConcurrentDictionary<string, byte>();
app.UseCors();

app.MapGet("/health", () => Results.Ok(new { printer = printerName, status = "ready" }));

app.MapPost("/print", (Receipt receipt) =>
{
    if (string.IsNullOrWhiteSpace(receipt.SaleId) || receipt.Items.Count == 0)
        return Results.BadRequest(new { error = "A receipt with at least one item is required." });

    try
    {
        if (!receipt.Reprint && printedSales.ContainsKey(receipt.SaleId))
            return Results.Ok(new { printed = true, duplicate = true, receipt.SaleId, printer = printerName });

        RawPrinter.Send(printerName, ReceiptCommands.Build(receipt));
        printedSales.TryAdd(receipt.SaleId, 0);
        return Results.Ok(new { printed = true, receipt.SaleId, printer = printerName });
    }
    catch (Exception exception)
    {
        return Results.Problem($"Receipt was saved, but could not be printed to {printerName}: {exception.Message}", statusCode: 503);
    }
});

/* --------------------------------------------------------------- console --
   What the shopkeeper sees when they double-click the app each morning.
-------------------------------------------------------------------------- */

Console.Title = "Receipt Printer - Billing POS";
Console.WriteLine();
Console.WriteLine("  ============================================");
Console.WriteLine("    RECEIPT PRINTER");
Console.WriteLine("  ============================================");
Console.WriteLine();
Console.Write("    Printer : ");
Console.WriteLine(printerName);

if (RawPrinter.Exists(printerName))
{
    Console.WriteLine("    Status  : found and ready");
}
else
{
    Console.WriteLine("    Status  : NOT FOUND");
    Console.WriteLine();
    Console.WriteLine("    Windows has no printer with that exact name.");
    Console.WriteLine("    Check Settings > Bluetooth & devices > Printers,");
    Console.WriteLine($"    then put the exact name in:");
    Console.WriteLine($"      {printerFile}");
    Console.WriteLine("    Billing still works - receipts just will not print.");
}

Console.WriteLine();
Console.WriteLine("    Leave this window open while the shop is billing.");
Console.WriteLine("    Closing it stops receipts printing.");
Console.WriteLine();
Console.WriteLine("  --------------------------------------------");
Console.WriteLine();

try
{
    app.Run();
}
catch (IOException error) when (error.Message.Contains("address already in use", StringComparison.OrdinalIgnoreCase)
                             || error.InnerException is not null)
{
    Console.WriteLine("  The receipt printer app is ALREADY RUNNING.");
    Console.WriteLine("  Look for another window like this one - you only need one.");
    Console.WriteLine();
    Pause();
}
catch (Exception error)
{
    Console.WriteLine($"  The receipt printer app stopped: {error.Message}");
    Console.WriteLine();
    Pause();
}

// Without this a double-clicked window vanishes before the error can be read.
static void Pause()
{
    Console.WriteLine("  Press any key to close.");
    try { Console.ReadKey(true); } catch (InvalidOperationException) { /* no console attached */ }
}

// The trailing members carry defaults so an older caller that omits them still
// binds: System.Text.Json matches record parameters by name, not position.
record Receipt(string SaleId, string ShopName, string ShopAddress, string ShopPhone, string GstNumber, string BillNumber, string PaymentMode, decimal Subtotal,
    decimal GstAmount, decimal DiscountAmount, decimal GrandTotal, List<ReceiptItem> Items, DateTimeOffset? BillDate,
    bool Reprint, string? CustomerName = null, string? UpiId = null, decimal CollectedAmount = 0);
record ReceiptItem(string Name, decimal Price, int Quantity);

static class ReceiptCommands
{
    private const int Columns = 42;

    public static byte[] Build(Receipt receipt)
    {
        using var stream = new MemoryStream();
        void Bytes(params byte[] values) => stream.Write(values);
        void Text(string value) => stream.Write(Encoding.ASCII.GetBytes(value.Replace("\r", "").Replace("\n", " ") + "\n"));
        void Center(string value) => Text(value.Length >= Columns ? value[..Columns] : value.PadLeft((Columns + value.Length) / 2).PadRight(Columns));
        void Rule() => Text(new string('-', Columns));
        string Money(decimal value) => $"Rs.{value:0.00}";
        string Fit(string value, int width) => value.Length <= width ? value : value[..Math.Max(0, width - 1)] + "~";

        Bytes(0x1B, 0x40); // ESC @: initialise printer
        Bytes(0x1B, 0x74, 0x00); // ESC t 0: PC437 for reliable ASCII output
        Bytes(0x1B, 0x61, 0x01); // centre
        Bytes(0x1B, 0x45, 0x01); // bold
        Center(receipt.ShopName);
        Bytes(0x1B, 0x45, 0x00);
        foreach (var addressLine in (receipt.ShopAddress ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)) Center(addressLine.Trim());
        if (!string.IsNullOrWhiteSpace(receipt.ShopPhone)) Center($"Ph: {receipt.ShopPhone}");
        if (!string.IsNullOrWhiteSpace(receipt.GstNumber)) Center($"GSTIN: {receipt.GstNumber}");
        Bytes(0x1B, 0x61, 0x00); // left
        Rule();
        if (receipt.Reprint) { Bytes(0x1B, 0x45, 0x01); Text("*** REPRINT ***"); Bytes(0x1B, 0x45, 0x00); }
        Text($"Bill: {receipt.BillNumber}");
        if (receipt.BillDate is not null) Text($"Date: {receipt.BillDate.Value.LocalDateTime:dd-MM-yyyy hh:mm tt}");
        Text($"Payment: {receipt.PaymentMode}");
        if (!string.IsNullOrWhiteSpace(receipt.CustomerName)) Text($"Customer: {Fit(receipt.CustomerName, Columns - 10)}");
        Rule();
        Text("Item                       Qty    Amount");
        Rule();
        foreach (var item in receipt.Items)
        {
            var amount = Money(item.Price * item.Quantity);
            var line = $"{Fit(item.Name, 25).PadRight(25)} {item.Quantity,3} {amount,11}";
            Text(line);
        }
        Rule();

        // Subtotal and TOTAL only, by request. GST, discount, collected and
        // change are still calculated and still stored against the sale - they
        // are simply not printed on the customer's copy. They remain available
        // in Sales Reports and the Excel export.
        // Label on the left, amount flush right against the 42-column edge.
        void Amount(string label, string value) => Text(label + value.PadLeft(Columns - label.Length));

        Amount("Subtotal", Money(receipt.Subtotal));
        Bytes(0x1B, 0x45, 0x01);
        Text($"TOTAL{Money(receipt.GrandTotal),Columns - 5}");
        Bytes(0x1B, 0x45, 0x00);
        Rule();
        Bytes(0x1B, 0x61, 0x01);
        Bytes(0x1B, 0x45, 0x01);
        Center("THANK YOU");
        Bytes(0x1B, 0x45, 0x00);
        if (!string.IsNullOrWhiteSpace(receipt.UpiId)) Center($"UPI: {receipt.UpiId}");
        Bytes(0x1B, 0x64, 0x03); // ESC d 3: minimum three-line feed for the cutter
        Bytes(0x1D, 0x56, 0x01); // GS V 1: partial cut immediately after feed
        return stream.ToArray();
    }
}

static class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName = "POS Receipt"; public string? pOutputFile; public string? pDataType = "RAW"; }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] private static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO document);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)] private static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);

    /** Can Windows see a printer by this exact name? Opens and closes it, nothing more. */
    public static bool Exists(string printer)
    {
        if (string.IsNullOrWhiteSpace(printer)) return false;
        if (!OpenPrinter(printer, out var handle, IntPtr.Zero)) return false;
        ClosePrinter(handle);
        return true;
    }

    public static void Send(string printer, byte[] bytes)
    {
        if (!OpenPrinter(printer, out var handle, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error(), $"Printer '{printer}' was not found");
        try
        {
            if (StartDocPrinter(handle, 1, new DOCINFO()) == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not start the receipt job");
            try
            {
                if (!StartPagePrinter(handle)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not start the receipt page");
                try { if (!WritePrinter(handle, bytes, bytes.Length, out var written) || written != bytes.Length) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not send the complete receipt"); }
                finally { EndPagePrinter(handle); }
            }
            finally { EndDocPrinter(handle); }
        }
        finally { ClosePrinter(handle); }
    }
}
