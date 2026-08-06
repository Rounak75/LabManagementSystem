import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/stores/auth.store";
import { call } from "@/lib/api";
import { evictOldDrafts } from "@/lib/draft";
import { RequireRole } from "./components/RequireRole";
import { AppShell } from "./components/AppShell";
import { PageLoading } from "@/components/PageLoading";
import { Toaster } from "@/components/ui/Toast";

// Eager: the three screens that can be the first thing on screen. Anything the
// app might open with has to be in the initial chunk, or splitting just trades
// a slow start for a slow start with a spinner on it.
import Login from "./routes/Login";
import Recover from "./routes/Recover";
import FirstRunWizard from "./routes/FirstRunWizard";
import Dashboard from "./routes/Dashboard";

// Everything else is fetched when it is first navigated to.
//
// Every route used to be a static import, so Vite emitted one 3.7 MB bundle that
// Electron had to parse before React could paint — which is the blank white
// window the app opened on. The worst of it was never needed at startup at all:
// the report-template editor pulls in @react-pdf/renderer, and the invoice page
// pulls in a QR code library, neither of which the owner touches on login.
const PatientSearch = lazy(() => import("./routes/patients/PatientSearch"));
const PatientNew = lazy(() => import("./routes/patients/PatientNew"));
const PatientDetail = lazy(() => import("./routes/patients/PatientDetail"));
const VisitNew = lazy(() => import("./routes/visits/VisitNew"));
const VisitDetail = lazy(() => import("./routes/visits/VisitDetail"));
const ResultEntry = lazy(() => import("./routes/results/ResultEntry"));
const ReportsList = lazy(() => import("./routes/reports/ReportsList"));
const ReportPreview = lazy(() => import("./routes/reports/ReportPreview"));
const InvoiceView = lazy(() => import("./routes/invoices/InvoiceView"));
const TestCatalogue = lazy(() => import("./routes/tests/TestCatalogue"));
const OutsourcedList = lazy(() => import("./routes/outsourced/OutsourcedList"));
const DoctorDirectory = lazy(() => import("./routes/doctors/DoctorDirectory"));
const LabSettings = lazy(() => import("./routes/settings/LabSettings"));
const UserManagement = lazy(() => import("./routes/users/UserManagement"));
const AuditLog = lazy(() => import("./routes/audit/AuditLog"));
const NotificationsLog = lazy(() => import("./routes/notifications/NotificationsLog"));
const SyncLog = lazy(() => import("./routes/sync/SyncLog"));
const TemplateList = lazy(() => import("./routes/templates/TemplateList"));
const TemplateEditor = lazy(() => import("./routes/templates/TemplateEditor"));
const BookingsPage = lazy(() => import("./routes/bookings/BookingsPage"));

export default function App() {
  const { user, loading, bootstrap } = useAuth();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);

  useEffect(() => { evictOldDrafts(); }, []);

  useEffect(() => {
    (async () => {
      const need = await call<boolean>("auth:firstRunNeeded");
      setFirstRun(need);
      if (!need) await bootstrap();
      else useAuth.setState({ loading: false });
    })();
  }, []);

  if (loading || firstRun === null) {
    return (
      <>
        <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>
        <Toaster />
      </>
    );
  }
  if (firstRun) return <BrowserRouter><Routes><Route path="*" element={<FirstRunWizard />} /></Routes><Toaster /></BrowserRouter>;

  return (
    <BrowserRouter>
      <Toaster />
      {/* AppShell carries its own boundary so the sidebar survives a page load.
          This one is the backstop for any lazy route outside the shell. */}
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/recover" element={user ? <Navigate to="/" replace /> : <Recover />} />
        <Route element={<RequireRole><AppShell /></RequireRole>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/visits/new"           element={<VisitNew />} />
          <Route path="/visits/:id"           element={<VisitDetail />} />
          <Route path="/patients"             element={<PatientSearch />} />
          <Route path="/patients/new"         element={<PatientNew />} />
          <Route path="/patients/:id"         element={<PatientDetail />} />
          <Route path="/results/:visitTestId" element={<ResultEntry />} />
          <Route path="/reports"              element={<ReportsList />} />
          <Route path="/outsourced"           element={<OutsourcedList />} />
          <Route path="/reports/:visitId"     element={<ReportPreview />} />
          <Route path="/invoices/:id"         element={<InvoiceView />} />
          <Route path="/tests"    element={<RequireRole role="Admin"><TestCatalogue /></RequireRole>} />
          <Route path="/doctors"  element={<RequireRole role="Admin"><DoctorDirectory /></RequireRole>} />
          <Route path="/users"    element={<RequireRole role="Admin"><UserManagement /></RequireRole>} />
          <Route path="/audit"    element={<RequireRole role="Admin"><AuditLog /></RequireRole>} />
          <Route path="/bookings"      element={<RequireRole role="Admin"><BookingsPage /></RequireRole>} />
          <Route path="/notifications" element={<RequireRole role="Admin"><NotificationsLog /></RequireRole>} />
          <Route path="/sync" element={<RequireRole role="Admin"><SyncLog /></RequireRole>} />
          <Route path="/settings" element={<RequireRole role="Admin"><LabSettings /></RequireRole>} />
          <Route path="/templates"      element={<RequireRole role="Admin"><TemplateList /></RequireRole>} />
          <Route path="/templates/new"  element={<RequireRole role="Admin"><TemplateEditor /></RequireRole>} />
          <Route path="/templates/:id"  element={<RequireRole role="Admin"><TemplateEditor /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
