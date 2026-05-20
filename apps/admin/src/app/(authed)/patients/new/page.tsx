import { PatientForm } from "./PatientForm";

export default function NewPatientPage() {
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-4">New patient</h1>
      <PatientForm />
    </div>
  );
}
