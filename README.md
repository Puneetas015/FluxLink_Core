# FluxLink_Core

A smart identity resolution engine designed to connect the dots between fragmented customer data. Instead of creating duplicate profiles, FluxLink_Core recognizes when different orders belong to the same person—even if they use a new email or phone number—and organizes everything into a single, consolidated "Source of Truth."

## 🚀 How it Works
When a new order comes in, the system follows a logical "Detective" process:
1. **Search**: It checks the database for any existing records matching the email or phone number.
2. **Link**: If a match is found, it links the new information as a **Secondary** record to the original **Primary** account.
3. **Merge**: If a request links two previously separate people, the engine "merges" them, demoting the newer primary record to secondary to keep the history clean.

## 🛠️ Tech Stack
- **Runtime**: Node.js (with ESM support)
- **Language**: TypeScript (using ts-node for execution)
- **Database**: SQLite3 (chosen for its speed and zero-config portability)
- **Framework**: Express.js

## 📦 Local Setup
1. **Install dependencies**:
   ```bash
   npm install
2. Launch the Service:
   ```bash
   node --loader ts-node/esm main.ts
3. Test the Endpoint:
The service listens for POST requests at http://localhost:3000/identify.

📊 System Output Proof
Below is a real-world demonstration of the service resolving identities across three separate requests. It correctly identifies the primary contact and links subsequent new information (emails and IDs) as secondary records.

Developed as a high-performance solution for unified customer data management.
