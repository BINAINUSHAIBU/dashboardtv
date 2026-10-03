# BTECH-TV WORLD IPTV DASHBOARD — FAST + PACKAGE ACCESS

## Access flow
1. New users receive a 5-minute demo trial with up to 500 channels.
2. When the trial expires, the package selector appears.
3. Packages: 500 through 10,051 channels.
4. User selects a demo payment gateway and proceeds.
5. The selected channel limit is activated for 30 days.
6. The player displays a BTECH-TV watermark/logo.

## Production payment
The current Paystack/Flutterwave/Monnify/Stripe choices are explicitly DEMO activation controls. Replace `proceedPayment()` with the corresponding provider checkout and verify payment server-side before granting 30-day access.


## Super Admin Control Center
Open `super-admin.html` from the project. It provides:
- Complete channel directory with search, country/status filters and pagination.
- Lock, unlock, disable/enable and bulk channel controls.
- Locked Channel Manager.
- Per-channel Pay-To-View pricing, duration and demo sales controls.
- User Manager with create/edit/suspend/activate controls.
- Platform settings for trial, package, security, watermark and payment gateways.
- Admin activity log and JSON export.
- LocalStorage is used for demo/admin UI state.

**Production note:** this front-end admin panel is a control UI, not a security boundary. For production, move authentication, roles, channel locks, subscriptions, payment verification and authorization to a server-side API/database. Never trust client-side LocalStorage for paid access.
