# 💊 PharmaRoyalties+: Blockchain-Based Royalty Tracking and Supply Chain Verification for Pharmaceutical Innovations

Welcome to PharmaRoyalties+, an enhanced decentralized solution built on the Stacks blockchain using Clarity smart contracts! This project tackles the persistent challenges in the pharmaceutical industry, including opaque royalty distributions in collaborative R&D and counterfeit drugs eroding legitimate revenue streams. By integrating royalty tracking with immutable supply chain verification, inventors receive fair, automated compensation based on verified sales, while ensuring drug authenticity from manufacturer to patient. This reduces disputes, fraud, and administrative costs, fostering trust in global pharma ecosystems.

## ✨ Features

🔒 Secure registration of patents and innovations with immutable hashes and timestamps  
📊 Track inventor contributions, ownership percentages, and milestone-based payouts  
🤝 Manage multi-party R&D and licensing agreements with built-in signatures  
💰 Automated royalty calculations and distributions tied to verified revenue  
⚖️ Dispute resolution with stakeholder voting and arbitration  
📈 Real-time auditing of royalties, supply chain events, and compliance reports  
🚀 IoT integration for cold chain monitoring and authenticity checks  
🛡️ Anti-counterfeit measures via serialized batch tracking and verification proofs  
🔗 Tokenization of royalty shares as tradeable assets for liquidity  
🌐 Oracle support for off-chain revenue and sales data verification  

## 🛠 How It Works

PharmaRoyalties+ employs 9 interconnected Clarity smart contracts to streamline royalty management and supply chain integrity. Inventors register innovations, define agreements, and automate payouts from authenticated sales. The system leverages blockchain for transparency, with oracles feeding real-world data like sales figures and IoT sensor readings for cold chain compliance.

### For Inventors and Researchers
- Generate a SHA-256 hash of your patent or innovation document.
- Use the `register-innovation` function in the InnovationRegistry contract to store the hash, metadata, and contributor details.
- Set up royalty terms in the RoyaltyAgreement contract, including percentages, milestones (e.g., clinical trial phases), and supply chain triggers.
- As verified revenue enters the system (e.g., from drug sales), the PaymentDistributor contract handles automatic STX token disbursements.

### For Pharmaceutical Companies and Distributors
- Register drug batches via the SupplyChainTracker contract, linking them to registered innovations.
- Manage licenses and partnerships through the LicenseManager contract.
- Deposit revenue and report supply chain events (e.g., shipments, verifications) in the RevenueTracker contract, which cross-checks authenticity and triggers royalties.
- Use IoT oracles to log cold chain data, ensuring compliance and preventing payouts on compromised batches.

### For Verifiers and Auditors
- Instantly verify innovation ownership, batch authenticity, or royalty history with the VerificationTools contract.
- Access immutable logs via the AuditLog contract for regulatory compliance.

### For Dispute Resolution
- File disputes in the DisputeResolution contract, enabling secure voting or external arbitration among verified stakeholders.
- Resolutions are enforced automatically, updating agreements and distributions.

This enhanced system not only ensures fair compensation but also combats counterfeits, potentially increasing genuine revenue by 20-30% in high-risk markets, based on industry trends.

## 📑 Smart Contracts Overview

This project features 9 Clarity smart contracts, each optimized for modularity and security. Interactions are event-driven for efficiency.

1. **InnovationRegistry.clar**: Registers patents/innovations with hashes, metadata, timestamps, and prevents duplicates.
2. **InventorRegistry.clar**: Manages profiles, contributions, and dynamic ownership updates with multi-sig approvals.
3. **RoyaltyAgreement.clar**: Creates customizable agreements with milestone triggers, percentages, and tokenization options.
4. **LicenseManager.clar**: Handles licensing deals, tracking terms, licensees, and linked supply chains.
5. **SupplyChainTracker.clar**: Logs batch serialization, shipments, IoT data, and authenticity verifications.
6. **RevenueTracker.clar**: Records verified revenue from oracles, associates with innovations, and emits distribution events.
7. **PaymentDistributor.clar**: Computes and executes royalty payouts in STX, with support for tokenized shares.
8. **DisputeResolution.clar**: Manages disputes, voting, arbitration, and automated enforcement.
9. **AuditLog.clar & VerificationTools.clar** (combined for efficiency): Provides logging, querying, and proof-generation for all system activities.

## 🚀 Getting Started

1. Set up Clarity tools and a Stacks wallet.
2. Deploy contracts to the Stacks testnet with Clarinet.
3. Integrate oracles (e.g., for sales data) and test with mock innovations: Register a patent, track a supply chain batch, simulate revenue, and observe automated royalties.
4. Build a dApp frontend for easy interaction, including dashboard for real-time tracking.

Empower fair innovation and secure pharma supply chains with PharmaRoyalties+!