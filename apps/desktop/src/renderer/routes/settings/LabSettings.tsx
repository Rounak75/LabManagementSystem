import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { BackupPanel } from "./BackupPanel";
import { NotificationsTab } from "./NotificationsTab";
import { PaymentsTab } from "./PaymentsTab";
import { CloudSyncTab } from "./CloudSyncTab";
import { LetterheadCalibration } from "./LetterheadCalibration";
import { LabClosuresTab } from "./LabClosuresTab";

type Tab = "lab" | "notifications" | "payments" | "cloud" | "letterhead" | "closures";

export default function LabSettings() {
  const [activeTab, setActiveTab] = useState<Tab>("lab");
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ["settings"], queryFn: () => call<any>("settings:get") });
  const { register, handleSubmit, reset } = useForm();
  const [logoError, setLogoError] = useState<string | null>(null);
  useEffect(() => { if (s) reset(s); }, [s, reset]);

  const save = useMutation({
    mutationFn: (v: any) => call("settings:update", {
      labName: v.labName, labAddress: v.labAddress, labPhone: v.labPhone, labEmail: v.labEmail || null,
      morningOpenTime: v.morningOpenTime, morningCloseTime: v.morningCloseTime,
      eveningOpenTime: v.eveningOpenTime || null, eveningCloseTime: v.eveningCloseTime || null,
      childAgeBoundary: Number(v.childAgeBoundary),
      pathologistName: v.pathologistName || null, pathologistQuals: v.pathologistQuals || null,
      isOpenToday: !!v.isOpenToday, manualClosureReason: v.manualClosureReason || null,
      // Phase 3d
      portalUrl: v.portalUrl?.trim() || null,
      preferredPaymentGateway: v.preferredPaymentGateway || "UPI"
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] })
  });

  const uploadLogo = useMutation({
    mutationFn: async () => {
      const sourcePath = await call<string | null>("app:pickFile", {
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }]
      });
      if (!sourcePath) return null;
      return call<{ path: string }>("settings:uploadLogo", { sourcePath });
    },
    onSuccess: (r) => {
      if (r) {
        setLogoError(null);
        qc.invalidateQueries({ queryKey: ["settings"] });
      }
    },
    onError: (err: any) => {
      const code = err?.code || "";
      if (code === "FILE_TOO_LARGE") setLogoError("Logo file is too large. Max size is 256 KB.");
      else if (code === "INVALID_INPUT") setLogoError("Please choose a PNG or JPG image.");
      else setLogoError(err?.message || "Failed to upload logo.");
    }
  });

  const removeLogo = useMutation({
    mutationFn: () => call<{ ok: true }>("settings:removeLogo"),
    onSuccess: () => {
      setLogoError(null);
      qc.invalidateQueries({ queryKey: ["settings"] });
    }
  });

  if (!s) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="max-w-2xl">
      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {([
          { key: "lab",           label: "Lab & Backups" },
          { key: "notifications", label: "Notifications" },
          { key: "payments",      label: "Payments" },
          { key: "cloud",         label: "Cloud sync" },
          { key: "letterhead",    label: "Letterhead" },
          { key: "closures",      label: "Closures" },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-b-2 border-brand text-brand"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "notifications" && <NotificationsTab />}
      {activeTab === "payments" && <PaymentsTab />}
      {activeTab === "cloud" && <CloudSyncTab />}
      {activeTab === "letterhead" && <LetterheadCalibration />}
      {activeTab === "closures" && <LabClosuresTab />}
      {activeTab === "lab" && (
        <>
      <h1 className="mb-4 text-2xl font-semibold">Lab settings</h1>

      <Card>
        <h2 className="mb-3 text-lg font-medium">Branding</h2>
        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-700">Lab logo</div>
          {s.labLogo ? (
            <div className="flex items-start gap-4">
              <img
                src={`file://${String(s.labLogo).replace(/\\/g, "/")}`}
                alt="Lab logo"
                className="h-20 max-w-xs rounded border bg-white object-contain p-1"
              />
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => uploadLogo.mutate()}
                  disabled={uploadLogo.isPending}
                >
                  {uploadLogo.isPending ? "Uploading…" : "Replace logo"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removeLogo.mutate()}
                  disabled={removeLogo.isPending}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                type="button"
                onClick={() => uploadLogo.mutate()}
                disabled={uploadLogo.isPending}
              >
                {uploadLogo.isPending ? "Uploading…" : "Upload logo"}
              </Button>
            </div>
          )}
          {logoError && <div className="text-sm text-red-600">{logoError}</div>}
          <div className="text-xs text-slate-500">
            Used as the report header logo. PNG or JPG, max 256 KB.
          </div>
        </div>
      </Card>

      <div className="mt-4">
        <Card>
          <form onSubmit={handleSubmit(v => save.mutate(v))} className="grid grid-cols-2 gap-3">
            <Input label="Lab name" className="col-span-2" {...register("labName")} />
            <Input label="Phone" {...register("labPhone")} />
            <Input label="Email (optional)" {...register("labEmail")} />
            <Input label="Address" className="col-span-2" {...register("labAddress")} />
            <Input label="Morning open"  type="time" {...register("morningOpenTime")} />
            <Input label="Morning close" type="time" {...register("morningCloseTime")} />
            <Input label="Evening open"  type="time" {...register("eveningOpenTime")} />
            <Input label="Evening close" type="time" {...register("eveningCloseTime")} />
            <Input label="Child age boundary (years)" type="number" {...register("childAgeBoundary")} />
            <Input label="Pathologist name"          {...register("pathologistName")} />
            <Input label="Pathologist qualifications" className="col-span-2" {...register("pathologistQuals")} />
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" {...register("isOpenToday")} /> Open today</label>
            <Input label="Closure reason (if closed today)" className="col-span-2" {...register("manualClosureReason")} />
            <Input label="Patient portal URL" className="col-span-2" placeholder="golmurijanchghar.vercel.app/patient" {...register("portalUrl")} />
            <Select label="Primary payment gateway in portal" className="col-span-2" {...register("preferredPaymentGateway")}>
              <option value="UPI">UPI (direct, no gateway fees)</option>
              <option value="Razorpay">Razorpay (hidden until KYC clears)</option>
            </Select>
            <div className="col-span-2 flex justify-end"><Button type="submit">Save</Button></div>
          </form>
        </Card>
      </div>
      <BackupPanel />
        </>
      )}
    </div>
  );
}
