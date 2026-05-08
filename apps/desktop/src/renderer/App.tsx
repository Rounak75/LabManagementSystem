import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/stores/auth.store";
import { call } from "@/lib/api";
import Login from "./routes/Login";
import Recover from "./routes/Recover";
import FirstRunWizard from "./routes/FirstRunWizard";
import Dashboard from "./routes/Dashboard";
import { RequireRole } from "./components/RequireRole";
import { AppShell } from "./components/AppShell";
import PatientSearch from "./routes/patients/PatientSearch";
import PatientNew from "./routes/patients/PatientNew";
import PatientDetail from "./routes/patients/PatientDetail";
import VisitNew from "./routes/visits/VisitNew";
import VisitDetail from "./routes/visits/VisitDetail";
import ResultEntry from "./routes/results/ResultEntry";
import ReportsList from "./routes/reports/ReportsList";
import ReportPreview from "./routes/reports/ReportPreview";
import InvoiceView from "./routes/invoices/InvoiceView";
import TestCatalogue from "./routes/tests/TestCatalogue";
import OutsourcedList from "./routes/outsourced/OutsourcedList";
import DoctorDirectory from "./routes/doctors/DoctorDirectory";
import LabSettings from "./routes/settings/LabSettings";
import UserManagement from "./routes/users/UserManagement";
import AuditLog from "./routes/audit/AuditLog";
import TemplateList from "./routes/templates/TemplateList";
import TemplateEditor from "./routes/templates/TemplateEditor";

export default function App() {
  const { user, loading, bootstrap } = useAuth();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const need = await call<boolean>("auth:firstRunNeeded");
      setFirstRun(need);
      if (!need) await bootstrap();
      else useAuth.setState({ loading: false });
    })();
  }, []);

  if (loading || firstRun === null) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (firstRun) return <BrowserRouter><Routes><Route path="*" element={<FirstRunWizard />} /></Routes></BrowserRouter>;

  return (
    <BrowserRouter>
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
          <Route path="/settings" element={<RequireRole role="Admin"><LabSettings /></RequireRole>} />
          <Route path="/templates"      element={<RequireRole role="Admin"><TemplateList /></RequireRole>} />
          <Route path="/templates/new"  element={<RequireRole role="Admin"><TemplateEditor /></RequireRole>} />
          <Route path="/templates/:id"  element={<RequireRole role="Admin"><TemplateEditor /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
