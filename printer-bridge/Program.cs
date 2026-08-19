using System.ComponentModel;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;

const string printerName = "RETSOL RTP-81";

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:9101");
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback)
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
        if (printedSales.ContainsKey(receipt.SaleId))
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

app.Run();

record Receipt(string SaleId, string ShopName, string BillNumber, string PaymentMode, decimal Subtotal,
    decimal GstAmount, decimal DiscountAmount, decimal GrandTotal, List<ReceiptItem> Items);
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
        Bytes(0x1B, 0x74, 0x00); // ESC t 0: PC437; money is rendered as Rs. for reliable printer output
        Bytes(0x1B, 0x61, 0x01); // centre
        Bytes(0x1B, 0x45, 0x01); // bold
        Center(receipt.ShopName);
        Bytes(0x1B, 0x45, 0x00);
        Center("Indian Oil Petrol Bunk, Ullagaram");
        Center("Madipakkam, Chennai - 91");
        Center("Ph: 637463203 / 7358251270");
        Center("We undertake party orders");
        Bytes(0x1B, 0x61, 0x00); // left
        Rule();
        Text($"Bill: {receipt.BillNumber}");
        Text($"Payment: {receipt.PaymentMode}");
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
        Text($"Subtotal{Money(receipt.Subtotal),Columns - 8}");
        if (receipt.GstAmount != 0) Text($"GST{Money(receipt.GstAmount),Columns - 3}");
        if (receipt.DiscountAmount != 0) Text($"Discount -{Money(receipt.DiscountAmount),Columns - 10}");
        Bytes(0x1B, 0x45, 0x01);
        Text($"TOTAL{Money(receipt.GrandTotal),Columns - 5}");
        Bytes(0x1B, 0x45, 0x00);
        Rule();
        Bytes(0x1B, 0x61, 0x01);
        Bytes(0x1B, 0x45, 0x01);
        Center("THANK YOU");
        Bytes(0x1B, 0x45, 0x00);
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
