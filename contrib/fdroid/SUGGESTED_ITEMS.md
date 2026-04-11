# F-Droid MR — “Suggested” section (honest answers)

Paste under **Suggested** in your GitLab merge request (adjust if your pipeline status changed).

---

**External repos as git submodules instead of srclibs**

- [ ] Not used.

*Prayer Times is a React Native app: dependencies come from **`package.json` / `package-lock.json`** via **`npm ci`** in the build recipe. Replacing npm packages with Git submodules is not standard and would not improve F-Droid updates. Dependencies are built from the locked tree at the tagged commit.*

---

**Enable reproducible builds**

- [ ] Not enabled for this submission.

*`No, I don't want this.`*

*Reproducible builds for React Native + Hermes would need extra upstream work (toolchain pinning, signing alignment, etc.). Happy to revisit with maintainer guidance after the app is accepted.*

---

**Multiple APKs for native code**

- [ ] Not used; shipping a **universal** `fdroid` release APK for now.

*The app includes native code (Hermes, CMake, etc.); a single universal APK keeps the metadata recipe simple (`output` points to one file). Per-ABI splits can be reconsidered later if F-Droid’s pipeline prefers them.*

---

**Closes rfp# / Closes fdroiddata#**

*Remove those lines, or write:* **N/A — no related RFP or fdroiddata issues.**
