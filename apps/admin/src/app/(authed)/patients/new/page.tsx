import { PatientForm } from "./PatientForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewPatientPage() {
  return (
    <div className="max-w-lg">
      <PageHeader title="New patient" subtitle="Register someone new at the lab" />
      <div className="card p-5 sm:p-6">
        <PatientForm />
      </div>
    </div>
  );
}
