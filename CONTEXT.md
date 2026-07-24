# Domain Model & Glossary

This file establishes the ubiquitous language and domain concepts for the Lab Management System. When writing code or discussing the architecture, these terms must be used consistently.

## Core Concepts

* **Visit**: A patient's physical appearance at the lab (or a phlebotomist's visit to the patient) to provide samples for testing.
* **Booking**: A request made by a patient via the web portal for a future test. Bookings are subject to blackout dates and collection time restrictions (e.g., Fasting).
* **Test**: A specific lab procedure (e.g., "Blood Sugar Fasting", "Complete Blood Count") offered by the lab.
* **Test Catalogue**: The authoritative list of all available tests, their prices, and categorical parameters.
* **Slot**: A designated time window (Morning, Afternoon, Evening) during which sample collection can occur.

## Modules & Orchestrators

* **VisitOrchestrator**: The deep domain module in the desktop app responsible for enforcing the business logic of Visit creation (validating tests, calculating totals, generating access codes, and emitting domain events).
* **SyncEngine**: The generic orchestration module in the desktop app responsible for polling the cloud database and applying updates locally. It maintains a registry of domain-specific adapters (`SyncHandler`).
* **BookingState**: The domain rules engine inside the portal app that encapsulates the constraints for scheduling tests (blackout dates, slot rules, UI state transitions).
