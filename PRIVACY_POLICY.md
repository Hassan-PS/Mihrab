# Integritetspolicy — Prayer Times

**Gäller från:** 2026-04-10  
**App:** Prayer Times (Android/iOS)

Den här policyn beskriver hur appen **Prayer Times** hanterar uppgifter på din enhet och i samband med nätverksanrop. Policyn är avsedd för användare och för länkning från t.ex. Google Play.

## Personuppgiftsansvarig

Appen utvecklas som öppen källkod. För frågor om denna policy, använd projektets GitHub‑issues:  
[https://github.com/Hassan-PS/PrayerApp/issues](https://github.com/Hassan-PS/PrayerApp/issues)

## Vilka uppgifter som kan behandlas

- **Plats (känslig)**  
  Om du väljer enhetsplats används GPS/plats från enheten för att berätta bön­tider och relaterade funktioner (t.ex. kompass). Om du i stället anger plats manuellt eller via ortsökning används de koordinater du valt.

- **Inställningar och appdata på enheten**  
  T.ex. språk, utseende, vald datakälla, beräkningsinställningar och notisinställningar lagras lokalt på enheten i AsyncStorage (i klartext). De skickas inte till en central server som drivs av appens utvecklare.

- **Platsuppgifter på enheten (krypterade vid vila)**  
  Sparade platskoordinater (manuellt valda och senast hämtade GPS-positioner) samt ortnamn lagras **krypterat** lokalt på enheten via plattformens säkra lagring: **iOS Keychain** respektive **Android EncryptedSharedPreferences** (Android Keystore). Plattextlagring av koordinater i AsyncStorage används inte; befintliga klartext-värden från äldre versioner migreras automatiskt till den krypterade lagringen vid första öppnandet efter uppdateringen och tas sedan bort från klartextlagringen.

- **Nätverksanrop**  
  För att visa bön­tider och ortsökning behöver appen internetanslutning. Vid dessa anrop kan **tekniska uppgifter** som IP‑adress, tidpunkt och begärd URL behandlas av respektive tredjepartstjänst enligt deras egna villkor.

## Syfte och rättslig grund (GDPR)

Behandling sker för att **tillhandahålla appens kärnfunktioner** (bön­tider, platsbaserade beräkningar, notiser du aktiverar, widget där sådan finns). För frivilliga köp (donation/tips via appbutiken) gäller **Google Play** eller **Apple** som betalvärd.

## Tredje parter (leverantörer av innehåll och tjänster)

Appen hämtar data från externa källor som du indirekt använder när du använder funktionerna, bland annat:

- **Bön­tider** från valda API:er/leverantörer (beroende på inställning), med **koordinater och datum** som behövs för beräkning eller uppslag.
- **Ortsökning** via **OpenStreetMap Nominatim** när du söker plats; din **sökfråga** skickas till Nominatim enligt deras användarvillkor.

Vi använder **inga** egna analyspaneler, annonsnätverk eller kraschrapporteringstjänster i den här kodbasen.

## Notiser

Om du aktiverar notiser schemaläggs de på enheten (lokalt). Innehållet baseras på appens data; det skickas inte till utvecklaren som personlig händelselogg.

## Köp i appen

Donationer/tips hanteras av **Google Play** eller **Apple**. Vi får inte dina fullständiga betalningskortsuppgifter. Se respektive butiks integritetspolicy för köpdata.

## Lagring och säkerhet

- Inställningar och platsval som sparas i appen ligger **på enheten**.
- **Koordinater krypteras vid vila** via iOS Keychain / Android EncryptedSharedPreferences. På en upplåst enhet är de tillgängliga för appen; på en låst enhet (skärmlås aktivt) skyddas de av plattformens nyckelhantering.
- Android: `android:allowBackup` är satt till **false** i manifestet (ingen säkerhetskopiering via Android Backup för appdata i denna konfiguration).
- Använd en uppdaterad enhet och lås skärm för att skydda enhetsdata.

## Dina rättigheter (EU/EEA)

Du kan när som helst **ändra eller återkalla** platsbehörigheter i enhetens inställningar, **ställa in manuell plats** i appen eller **avinstallera** appen. För rättigheter kopplade till köp, kontakta **Google** eller **Apple** enligt deras processer.

## Barn

Appen är **inte riktad till barn under 13 år** som primär målgrupp. Vi samlar inte medvetet in personuppgifter från barn under 13 år. Om du är vårdnadshavare och anser att ett barn har lämnat uppgifter i strid med detta, kontakta oss via GitHub‑issues så att vi kan hjälpa till att radera lokal data (där det är tekniskt möjligt — vi har ingen central användardatabas).

## Ändringar

Vi kan uppdatera denna policy när appen eller lagkrav ändras. Datum högst upp ändras då. Fortsatt användning efter uppdatering kan innebära att du godkänner den nya texten; vid större ändringar bör du läsa om policyn.

---

# Privacy Policy — Prayer Times

**Effective:** 2026-04-10  
**App:** Prayer Times (Android/iOS)

This policy describes how the **Prayer Times** app handles information on your device and in connection with network requests. It is for end users and for linking from stores (e.g. Google Play).

## Data controller / contact

The app is developed as open source. For questions about this policy, use the project’s GitHub issues:  
[https://github.com/Hassan-PS/PrayerApp/issues](https://github.com/Hassan-PS/PrayerApp/issues)

## Data that may be processed

- **Location (sensitive)**  
  If you choose device location, GPS/device location is used for prayer times and related features (e.g. compass). If you use manual coordinates or place search, those coordinates are used.

- **On-device settings**  
  Language, appearance, data provider, calculation options, notification preferences, and saved location are stored **locally** on the device. They are not sent to a central server operated by the app developer.

- **Network requests**  
  Prayer times and place search require internet access. Third-party services may process **technical data** such as IP address, time, and requested URLs under their own policies.

## Purpose (GDPR)

Processing is for **providing core app functionality** (prayer times, location-based calculations, optional notifications, widgets where applicable). Optional tips/donations use **Google Play** or **Apple** as the payment platform.

## Third-party services

The app retrieves data from external sources when you use features, including:

- **Prayer time APIs** (depending on your settings), sending **coordinates and dates** needed for lookup or calculation.
- **OpenStreetMap Nominatim** for place search; your **search query** is sent to Nominatim under their terms.

This codebase does **not** integrate first-party analytics, ad networks, or crash reporting services.

## Notifications

If enabled, notifications are scheduled **on the device**. Content is derived from app data; it is not sent to the developer as a personal event log.

## In-app purchases

Tips/donations are processed by **Google Play** or **Apple**. We do not receive your full card details. See the store’s privacy policy for purchase-related data.

## Storage and security

- Saved settings and location choices stay **on the device**.  
- Android: `android:allowBackup` is **false** in the app manifest (no Android Backup of app data in this configuration).  
- Use an updated OS and device lock to protect on-device data.

## Your rights (EU/EEA)

You may **change or revoke** location permissions in system settings, use **manual location** in the app, or **uninstall** the app. For purchase-related rights, use **Google** or **Apple**’s processes.

## Children

The app is **not directed at children under 13** as its primary audience. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe a child has provided information inconsistently with this policy, contact us via GitHub issues so we can help with **local** data removal where technically possible (there is no central user database).

## Changes

We may update this policy when the app or legal requirements change. The date at the top will be updated. Continued use after updates may mean you accept the new text; please review the policy after material changes.
