  import { useState, useMemo, useEffect, useRef } from "react";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "../components/ui/card";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "../components/ui/table";
  import { Badge } from "../components/ui/badge";
  import { Button } from "../components/ui/button";
  import { Label } from "../components/ui/label";
  import {
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Info,
    Droplet,
    Upload,
    X,
    ImageIcon,
    BookOpen,
  } from "lucide-react";
import { WEBHOOKS } from "../config/webhooks";
  const CONFIRM_URL = WEBHOOKS.PAINT_CONFIRM;
  const N8N_ANALYZER_URL = WEBHOOKS.PAINT_ANALYZER;

  export default function PaintComponentAnalyzer() {
    const [colorAnalysis, setColorAnalysis] = useState(null);
    const [batchSizeLiters, setBatchSizeLiters] = useState(0.1);
    const [uploadedImage, setUploadedImage] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState("");
    const [isConfirming, setIsConfirming] = useState(false);
    const fileInputRef = useRef(null);

    const [lastFetched, setLastFetched] = useState(null);

    // Send image to n8n, receive analysis back
    const analyzeWithN8n = async (imageBase64) => {
      setIsAnalyzing(true);
      setAnalyzeError("");
      setColorAnalysis(null);
      try {
        const response = await fetch(N8N_ANALYZER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
  action: "analyze",
  image: imageBase64,
  batchSizeLiters,
  source: "Paintelligent - Paint Component Analyzer",
  timestamp: new Date().toISOString(),
}),
        });
        if (!response.ok)
          throw new Error(`n8n returned HTTP ${response.status}`);
        const data = await response.json();

        const normalized = {
          hex: data.colorHex || data.hex || "#808080",
          dominantColor: data.dominantColor || "Unknown",
          rgb: data.rgb || { r: 128, g: 128, b: 128 },
          consistency: data.consistency || {
            type: "—",
            viscosity: "—",
            description: "—",
          },
          paintComponents: (
            data.components ||
            data.paintComponents ||
            []
          ).map((c) => ({
            // CSV schema fields
            no: c["No."] ?? c.no ?? null,
            brand: c.Brand || c.brand || "—",
            product: c.Product || c.product || c.name || "—",
            category: c.Category || c.category || "—",
            standardSize:
              c["Standard Size"] || c.standardSize || "—",
            volumeL: c["Volume (L)"] ?? c.volumeL ?? null,
            weightKg: c["Weight (kg)"] ?? c.weightKg ?? null,
            estPricePHP:
              c["Est. Price (PHP)"] ?? c.estPricePHP ?? 0,
            availability:
              c.Availability || c.availability || "Active",
            // Mix-specific fields
            percentage: c.percentage ?? 0,
            amountMl: c.amountMl ?? c.amount ?? 0,
            priceValue: c.priceValue ?? 0,
            stockLevel:
  Number(
    c.stockLevel ??
    c.stock ??
    c.Stocks ?? 
    0 
  ),

stockUsed:
  Number(
    c.stockUsed ??
    0
  ),

remainingStock:
  Number(
    c.remainingStock ??
    c.stockLevel ??
    c.stock ??
    c.Stocks ??
    0
  ),

stockStatus:
  c.stockStatus ||
  (
    Number(
      c.remainingStock ??
      c.stockLevel ??
      c.stock ??
      c.Stocks ??
      0
    ) <= 0
      ? "out_of_stock"
      : Number(
            c.remainingStock ??
            c.stockLevel ??
            c.stock ??
            c.Stocks ??
            0
        ) <= 5
        ? "low"
        : "adequate"
  ),
          })),
          applicationGuide: data.applicationGuide || null,
          stockWarnings: data.stockWarnings || [],
          totalPrice: data.totalPrice ?? null,
        };

        setColorAnalysis(normalized);
        setLastFetched(new Date());
      } catch (err) {
        setAnalyzeError(
          err.message || "Failed to analyze image via n8n.",
        );
      } finally {
        setIsAnalyzing(false);
      }
    };
const confirmPaintMix = async () => {

    if (!colorAnalysis) return;

    setIsConfirming(true);

    try {

        const response = await fetch(WEBHOOKS.PAINT_CONFIRM, {

            method: "PUT",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({

                paintComponents: colorAnalysis.paintComponents,

                batchSizeLiters,

            }),

        });

        if (!response.ok) {
            throw new Error("Failed to update inventory.");
        }

        const result = await response.json();

        alert("Inventory updated successfully!");

    } catch (err) {

        alert(err.message);

    } finally {

        setIsConfirming(false);

    }

};
    const handleFileChange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        setUploadedImage(base64);
        setColorAnalysis(null);
        setAnalyzeError("");
      };
      reader.readAsDataURL(file);
    };

    const handleRemoveImage = () => {
      setUploadedImage(null);
      setColorAnalysis(null);
      setAnalyzeError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // Scale components by batch size (base from n8n is per 100ml = 0.1L)
    const scaledComponents = useMemo(() => {
      if (!colorAnalysis) return [];
      const scaleFactor = batchSizeLiters / 0.1;
      return colorAnalysis.paintComponents.map((c) => {
        const baseAmount =
          typeof c.amountMl === "number"
            ? c.amountMl
            : parseFloat(c.amountMl) || 0;
        const scaledAmount = (baseAmount * scaleFactor).toFixed(
          1,
        );
        const scaledPrice = c.priceValue * scaleFactor;
        return {
          ...c,
          scaledAmountMl: scaledAmount,
          scaledPrice,
        };
      });
    }, [colorAnalysis, batchSizeLiters]);

    const totalPrice = useMemo(
      () =>
        colorAnalysis?.totalPrice != null
          ? colorAnalysis.totalPrice * (batchSizeLiters / 0.1)
          : scaledComponents.reduce(
              (sum, c) => sum + (c.scaledPrice || 0),
              0,
            ),
      [scaledComponents, colorAnalysis, batchSizeLiters],
    );

    return (
      <div className="p-6 space-y-6 bg-white min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {lastFetched && (
              <p className="text-xs text-gray-500 mt-1">
                Analyzed via n8n AI ·{" "}
                {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Image Upload */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Image Upload</CardTitle>
              <CardDescription>
                Upload a paint color image — it will be sent to
                your n8n AI agent for analysis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {!uploadedImage ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-56 border-2 border-dashed border-green-800 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#1a4d2e] hover:bg-green-50 transition-colors"
                >
                  <Upload className="size-14 text-gray-400 mb-3" />
                  <p className="text-base font-medium text-gray-700">
                    Click to upload color image
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    JPG, PNG or any image format
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden border shadow-md">
                    <img
                      src={uploadedImage}
                      alt="Uploaded color"
                      className="w-full h-64 object-cover"
                    />
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="size-10 text-white animate-spin" />
                        <p className="text-white font-semibold text-lg">
                          Analyzing with n8n AI...
                        </p>
                        <p className="text-green-200 text-sm">
                          Your AI agent is processing the image
                        </p>
                      </div>
                    )}
                  </div>

                  {analyzeError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">
                        {analyzeError}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      onClick={() =>
                        analyzeWithN8n(uploadedImage)
                      }
                      disabled={isAnalyzing}
                      className="bg-[#1a4d2e] hover:bg-[#2d6b45] disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />{" "}
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="size-4 mr-2" />{" "}
                          Analyze
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      variant="outline"
                      disabled={isAnalyzing}
                    >
                      <Upload className="size-4 mr-2" />
                      Change Image
                    </Button>
                    <Button
                      onClick={handleRemoveImage}
                      disabled={isAnalyzing}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      <X className="size-4 mr-2" />
                      Remove
                    </Button>
                  {/* <Button
    onClick={confirmPaintMix}
    disabled={!colorAnalysis || isAnalyzing || isConfirming}
    className="bg-yellow-600 hover:bg-yellow-800"
>
    {isConfirming
        ? "Updating Inventory..."
        : "Confirm Paint Mixture"}
</Button> */}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Results from n8n */}
        {colorAnalysis && (
          <>
            {/* Color Overview */}
            <Card className="border-l-4 border-[#1a4d2e]">
              <CardContent className="pt-5">
                <div className="flex items-center gap-4">
                  <div
                    className="size-16 rounded-xl border-2 border-white shadow-lg flex-shrink-0"
                    style={{ backgroundColor: colorAnalysis.hex }}
                  />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {colorAnalysis.hex.toUpperCase()}
                    </p>
                    <p className="text-sm text-gray-500">
                      Dominant:{" "}
                      <span className="font-medium text-gray-700">
                        {colorAnalysis.dominantColor}
                      </span>
                      &nbsp;·&nbsp;RGB({colorAnalysis.rgb.r},{" "}
                      {colorAnalysis.rgb.g}, {colorAnalysis.rgb.b}
                      )
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-green-700 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                    <CheckCircle2 className="size-5" />
                    <span className="text-sm font-semibold">
                      AI Analysis Complete
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Paint Mixing Formula + Prices */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplet className="size-5 text-[#1a4d2e]" />
                  Suggested Paint Mixture & Pricing
                </CardTitle>
                <CardDescription>
                  AI-recommended components for{" "}
                  {colorAnalysis.hex.toUpperCase()} from Garcia
                  Paint Center stock
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Batch Size */}
                <div className="mb-6 p-4 bg-green-50 rounded-lg border-2 border-[#1a4d2e]">
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Target Batch Size (Liters)
                  </Label>
                  <div className="flex items-center gap-4 flex-wrap">
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={batchSizeLiters}
                      onChange={(e) =>
                        setBatchSizeLiters(
                          parseFloat(e.target.value) || 0.1,
                        )
                      }
                      className="w-36 px-4 py-2 border-2 border-[#1a4d2e] rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-[#1a4d2e]"
                    />
                    <span className="text-sm text-gray-600">
                      = {(batchSizeLiters * 1000).toFixed(0)} ml
                    </span>
                    <div className="ml-auto flex gap-2">
                      {[
                        { label: "100ml", val: 0.1 },
                        { label: "500ml", val: 0.5 },
                        { label: "1L", val: 1 },
                        { label: "5L", val: 5 },
                      ].map(({ label, val }) => (
                        <Button
                          key={val}
                          onClick={() => setBatchSizeLiters(val)}
                          className={`text-xs ${batchSizeLiters === val ? "bg-[#2d6b45]" : "bg-[#1a4d2e] hover:bg-[#2d6b45]"}`}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No.</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead>
                        Amount ({batchSizeLiters}L)
                      </TableHead>
                      <TableHead>Est. Price/unit</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="text-right">
                        Subtotal (₱)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scaledComponents.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-gray-500">
                          {c.no ?? "—"}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {c.brand}
                        </TableCell>
                        <TableCell className="font-semibold text-sm max-w-[200px]">
                          {c.product}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="text-xs whitespace-nowrap"
                          >
                            {c.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {c.standardSize}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-[#1a4d2e]">
                            {c.percentage}%
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-[#1a4d2e]">
                          {c.scaledAmountMl} ml
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          ₱
                          {c.estPricePHP?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500">
                              {c.stockLevel} units
                            </span>
                            <Badge
                              variant="secondary"
                              className={
                                c.stockStatus === "adequate"
                                  ? "bg-green-100 text-green-800 text-xs"
                                  : c.stockStatus === "low"
                                    ? "bg-yellow-100 text-yellow-800 text-xs"
                                    : c.stockStatus === "critical"
                                      ? "bg-orange-100 text-orange-800 text-xs"
                                      : "bg-red-100 text-red-800 text-xs"
                              }
                            >
                              {c.stockStatus === "adequate"
                                ? "✓ Adequate"
                                : c.stockStatus === "low"
                                  ? "⚠ Low"
                                  : c.stockStatus === "critical"
                                    ? "⚠ Critical"
                                    : "✕ Out"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-800">
                          ₱{c.scaledPrice.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-[#1a4d2e] bg-green-50">
                      <TableCell
                        colSpan={9}
                        className="font-bold text-right text-base"
                      >
                        Total Price — {batchSizeLiters}L /{" "}
                        {(batchSizeLiters * 1000).toFixed(0)}ml
                        batch:
                      </TableCell>
                      <TableCell className="text-right font-bold text-xl text-[#1a4d2e]">
                        ₱{totalPrice.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Consistency */}
            {colorAnalysis.consistency &&
              colorAnalysis.consistency.type !== "—" && (
                <Card className="border-l-4 border-[#1a4d2e]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="size-5 text-[#1a4d2e]" />
                      Recommended Consistency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <Label className="text-sm text-gray-500">
                          Consistency Type
                        </Label>
                        <p className="text-xl font-bold text-[#1a4d2e] mt-1">
                          {colorAnalysis.consistency.type}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <Label className="text-sm text-gray-500">
                          Viscosity Level
                        </Label>
                        <p className="text-xl font-bold text-[#1a4d2e] mt-1">
                          {colorAnalysis.consistency.viscosity}
                        </p>
                      </div>
                    </div>
                    {colorAnalysis.consistency.description &&
                      colorAnalysis.consistency.description !==
                        "—" && (
                        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-700">
                            <span className="font-semibold">
                              Note:
                            </span>{" "}
                            {
                              colorAnalysis.consistency
                                .description
                            }
                          </p>
                        </div>
                      )}
                  </CardContent>
                </Card>
              )}

            {/* Application Guide */}
            {colorAnalysis.applicationGuide && (
              <Card className="border-l-4 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="size-5 text-blue-600" />
                    Application Guide
                  </CardTitle>
                  <CardDescription>
                    AI-generated painting instructions from your
                    n8n agent
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {typeof colorAnalysis.applicationGuide ===
                  "string" ? (
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {colorAnalysis.applicationGuide}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {colorAnalysis.applicationGuide.steps && (
                        <ol className="space-y-3">
                          {colorAnalysis.applicationGuide.steps.map(
                            (step, i) => (
                              <li key={i} className="flex gap-3">
                                <span className="flex-shrink-0 size-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                                  {i + 1}
                                </span>
                                <span className="text-sm text-gray-700">
                                  {step}
                                </span>
                              </li>
                            ),
                          )}
                        </ol>
                      )}
                      {colorAnalysis.applicationGuide.tools && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs font-semibold text-gray-600 mb-1">
                            Recommended Tools:
                          </p>
                          <p className="text-sm text-gray-700">
                            {colorAnalysis.applicationGuide.tools}
                          </p>
                        </div>
                      )}
                      {colorAnalysis.applicationGuide
                        .dryingTime && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-xs font-semibold text-amber-700 mb-1">
                            Drying Time:
                          </p>
                          <p className="text-sm text-amber-800">
                            {
                              colorAnalysis.applicationGuide
                                .dryingTime
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stock Warnings */}
            {colorAnalysis.stockWarnings.length > 0 && (
              <Card className="border-l-4 border-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-red-500" />
                    Stock Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {colorAnalysis.stockWarnings.map(
                      (warning, i) => (
                        <div
                          key={i}
                          className="flex gap-3 items-start p-3 bg-red-50 rounded-lg border border-red-100"
                        >
                          <AlertTriangle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-red-800 font-medium">
                            {warning}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }