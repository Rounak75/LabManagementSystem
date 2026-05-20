-- Phase 3e fix: the synced cloud tables were created with columns + indexes but
-- NO foreign-key constraints (see 20260518000001_init_synced_tables.sql). PostgREST
-- requires real FK constraints to resolve embedded selects like
-- `from('visits').select('*, patients(*)')` — without them the admin portal's
-- /patients, /visits, /payments, and results pages throw
-- "Could not find a relationship between '<a>' and '<b>' in the schema cache".
--
-- NOT VALID registers the constraint for PostgREST embedding without scanning
-- existing rows (the one-way backfill may have gaps). drop-if-exists + add makes
-- this idempotent and safe to re-run.

alter table visits         drop constraint if exists visits_patient_id_fkey;
alter table visits         add  constraint visits_patient_id_fkey         foreign key (patient_id)    references patients(id)    not valid;

alter table visit_tests    drop constraint if exists visit_tests_visit_id_fkey;
alter table visit_tests    add  constraint visit_tests_visit_id_fkey      foreign key (visit_id)      references visits(id)      not valid;

alter table visit_tests    drop constraint if exists visit_tests_test_id_fkey;
alter table visit_tests    add  constraint visit_tests_test_id_fkey       foreign key (test_id)       references tests(id)       not valid;

alter table parameters     drop constraint if exists parameters_test_id_fkey;
alter table parameters     add  constraint parameters_test_id_fkey        foreign key (test_id)       references tests(id)       not valid;

alter table results        drop constraint if exists results_visit_test_id_fkey;
alter table results        add  constraint results_visit_test_id_fkey     foreign key (visit_test_id) references visit_tests(id)  not valid;

alter table results        drop constraint if exists results_parameter_id_fkey;
alter table results        add  constraint results_parameter_id_fkey      foreign key (parameter_id)  references parameters(id)   not valid;

alter table invoices       drop constraint if exists invoices_visit_id_fkey;
alter table invoices       add  constraint invoices_visit_id_fkey         foreign key (visit_id)      references visits(id)      not valid;

alter table payments       drop constraint if exists payments_invoice_id_fkey;
alter table payments       add  constraint payments_invoice_id_fkey       foreign key (invoice_id)    references invoices(id)    not valid;

alter table payment_claims drop constraint if exists payment_claims_invoice_id_fkey;
alter table payment_claims add  constraint payment_claims_invoice_id_fkey foreign key (invoice_id)    references invoices(id)    not valid;

notify pgrst, 'reload schema';
