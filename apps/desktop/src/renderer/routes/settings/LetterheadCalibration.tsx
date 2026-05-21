import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface SavedCal { printerName: string; xOffsetMm: number; yOffsetMm: number; }
interface SysPrinter { name: string; isDefault: boolean; }

export function LetterheadCalibration() {
  const qc = useQueryClient();
  const { data: printers = [] } = useQuery({
    queryKey: ["printerCalibration", "system"],
    queryFn: () => call<SysPrinter[]>("printerCalibration:listSystemPrinters"),
  });
  const { data: calibrations = [] } = useQuery({
    queryKey: ["printerCalibration", "list"],
    queryFn: () => call<SavedCal[]>("printerCalibration:list"),
  });

  const [selected, setSelected] = useState("");
  const [xOffset, setXOffset] = useState(0);
  const [yOffset, setYOffset] = useState(0);

  useEffect(() => {
    if (selected || printers.length === 0) return;
    const def = printers.find((p) => p.isDefault) ?? printers[0];
    if (def) setSelected(def.name);
  }, [printers, selected]);

  useEffect(() => {
    if (!selected) return;
    const cal = calibrations.find((c) => c.printerName === selected);
    setXOffset(cal?.xOffsetMm ?? 0);
    setYOffset(cal?.yOffsetMm ?? 0);
  }, [selected, calibrations]);

  const save = useMutation({
    mutationFn: () =>
      call("printerCalibration:upsert", {
        printerName: selected,
        xOffsetMm: xOffset,
        yOffsetMm: yOffset,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["printerCalibration", "list"] }),
  });

  const printAlignment = useMutation({
    mutationFn: () => call("print:alignmentTest", { printerName: selected }),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Letterhead calibration</h1>

      <Card>
        <p className="mb-4 text-sm text-slate-600">
          Adjust where the printer places text on your pre-printed letterhead.
          Print the alignment test on plain paper, hold it under a real pre-printed
          sheet, and nudge the offsets until the crosshairs land inside the
          coloured boxes.
        </p>

        <div className="space-y-4">
          <Select label="Printer" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {printers.length === 0 && <option value="">No printers detected</option>}
            {printers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}{p.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="X offset (mm) — positive moves right"
              type="number" step="0.5"
              value={xOffset}
              onChange={(e) => setXOffset(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Y offset (mm) — positive moves down"
              type="number" step="0.5"
              value={yOffset}
              onChange={(e) => setYOffset(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button" variant="ghost"
              disabled={!selected || printAlignment.isPending}
              onClick={() => printAlignment.mutate()}
            >
              {printAlignment.isPending ? "Sending to printer…" : "Print alignment test"}
            </Button>
            <Button
              type="button"
              disabled={!selected || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save calibration"}
            </Button>
          </div>

          {save.isSuccess && <p className="text-sm text-green-700">Calibration saved.</p>}
          {printAlignment.isError && (
            <p className="text-sm text-red-600">
              Couldn't print the alignment test. Make sure the printer is on and connected.
            </p>
          )}

          <div className="border-t pt-3">
            <h3 className="text-sm font-medium text-slate-700">Saved calibrations</h3>
            {calibrations.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No calibrations yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {calibrations.map((c) => (
                  <li key={c.printerName}>
                    {c.printerName} — X {c.xOffsetMm}mm, Y {c.yOffsetMm}mm
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
