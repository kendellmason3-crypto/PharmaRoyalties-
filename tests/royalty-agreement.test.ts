import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Contributor {
  contributor: string;
  percentage: number;
}

interface Milestone {
  id: number;
  description: string;
  required: boolean;
  achieved: boolean;
  payoutPercentage: number;
}

interface Agreement {
  contributors: Contributor[];
  milestones: Milestone[];
  totalPercentage: number;
  tokenized: boolean;
  tokenSupply: number;
  signaturesRequired: number;
  signedBy: string[];
  lastUpdated: number;
}

interface ContributorShare {
  sharePercentage: number;
  tokenizedAmount: number;
  receivedPayouts: number;
  pendingPayouts: number;
}

interface MilestoneStatus {
  achievedAt: number | null;
  verifiedBy: string | null;
  payoutTriggered: boolean;
}

interface TokenizedShare {
  amount: number;
  lockedUntil: number;
}

interface ContractState {
  paused: boolean;
  admin: string;
  agreements: Map<string, Agreement>; // Key: innovation-hash (string for simplicity)
  contributorShares: Map<string, ContributorShare>; // Key: `${hash}_${contributor}`
  milestoneStatuses: Map<string, MilestoneStatus>; // Key: `${hash}_${milestoneId}`
  tokenizedShares: Map<string, TokenizedShare>; // Key: `${hash}_${holder}`
}

// Mock contract implementation
class RoyaltyAgreementMock {
  private state: ContractState = {
    paused: false,
    admin: "deployer",
    agreements: new Map(),
    contributorShares: new Map(),
    milestoneStatuses: new Map(),
    tokenizedShares: new Map(),
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_INVALID_PERCENTAGE = 101;
  private ERR_AGREEMENT_EXISTS = 102;
  private ERR_NO_AGREEMENT = 103;
  private ERR_INVALID_MILESTONE = 104;
  private ERR_INSUFFICIENT_SIGNATURES = 105;
  private ERR_ALREADY_SIGNED = 106;
  private ERR_INVALID_TOKEN_AMOUNT = 107;
  private ERR_PAUSED = 108;
  private ERR_INVALID_INNOVATION = 109;
  private ERR_MILESTONE_NOT_MET = 110;
  private ERR_PAYOUT_ALREADY_TRIGGERED = 111;

  private mockBlockHeight = 1000;
  private mockInnovationRegistry: Map<string, { owner: string; registered: boolean }> = new Map([
    ["hash1", { owner: "owner1", registered: true }],
    ["hash2", { owner: "owner2", registered: true }],
  ]);

  // Simulate block height increase
  private incrementBlockHeight() {
    this.mockBlockHeight += 1;
  }

  createAgreement(
    caller: string,
    innovationHash: string,
    contributors: Contributor[],
    milestones: Milestone[],
    signaturesRequired: number
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const innovation = this.mockInnovationRegistry.get(innovationHash);
    if (!innovation || !innovation.registered) {
      return { ok: false, value: this.ERR_INVALID_INNOVATION };
    }
    if (caller !== innovation.owner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.state.agreements.has(innovationHash)) {
      return { ok: false, value: this.ERR_AGREEMENT_EXISTS };
    }
    const totalPct = contributors.reduce((sum, c) => sum + c.percentage, 0);
    if (totalPct !== 100) {
      return { ok: false, value: this.ERR_INVALID_PERCENTAGE };
    }
    this.state.agreements.set(innovationHash, {
      contributors,
      milestones,
      totalPercentage: totalPct,
      tokenized: false,
      tokenSupply: 0,
      signaturesRequired,
      signedBy: [caller],
      lastUpdated: this.mockBlockHeight,
    });
    contributors.forEach((c) => {
      this.state.contributorShares.set(`${innovationHash}_${c.contributor}`, {
        sharePercentage: c.percentage,
        tokenizedAmount: 0,
        receivedPayouts: 0,
        pendingPayouts: 0,
      });
    });
    milestones.forEach((m) => {
      this.state.milestoneStatuses.set(`${innovationHash}_${m.id}`, {
        achievedAt: null,
        verifiedBy: null,
        payoutTriggered: false,
      });
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  updateAgreement(
    caller: string,
    innovationHash: string,
    newContributors: Contributor[],
    newMilestones: Milestone[]
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const agreement = this.state.agreements.get(innovationHash);
    if (!agreement) {
      return { ok: false, value: this.ERR_NO_AGREEMENT };
    }
    // Simulate multi-sig check (assume sufficient for test)
    const totalPct = newContributors.reduce((sum, c) => sum + c.percentage, 0);
    if (totalPct !== 100) {
      return { ok: false, value: this.ERR_INVALID_PERCENTAGE };
    }
    this.state.agreements.set(innovationHash, {
      ...agreement,
      contributors: newContributors,
      milestones: newMilestones,
      totalPercentage: totalPct,
      lastUpdated: this.mockBlockHeight,
      signedBy: [], // Reset
    });
    newContributors.forEach((c) => {
      this.state.contributorShares.set(`${innovationHash}_${c.contributor}`, {
        sharePercentage: c.percentage,
        tokenizedAmount: 0,
        receivedPayouts: 0,
        pendingPayouts: 0,
      });
    });
    newMilestones.forEach((m) => {
      this.state.milestoneStatuses.set(`${innovationHash}_${m.id}`, {
        achievedAt: null,
        verifiedBy: null,
        payoutTriggered: false,
      });
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  signAgreement(caller: string, innovationHash: string): ClarityResponse<boolean> {
    const agreement = this.state.agreements.get(innovationHash);
    if (!agreement) {
      return { ok: false, value: this.ERR_NO_AGREEMENT };
    }
    if (!agreement.contributors.some((c) => c.contributor === caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (agreement.signedBy.includes(caller)) {
      return { ok: false, value: this.ERR_ALREADY_SIGNED };
    }
    agreement.signedBy.push(caller);
    return { ok: true, value: true };
  }

  achieveMilestone(caller: string, innovationHash: string, milestoneId: number, verifier: string): ClarityResponse<boolean> {
    const agreement = this.state.agreements.get(innovationHash);
    if (!agreement) {
      return { ok: false, value: this.ERR_NO_AGREEMENT };
    }
    const msKey = `${innovationHash}_${milestoneId}`;
    const msStatus = this.state.milestoneStatuses.get(msKey);
    if (!msStatus) {
      return { ok: false, value: this.ERR_INVALID_MILESTONE };
    }
    if (msStatus.achievedAt !== null) {
      return { ok: false, value: this.ERR_MILESTONE_NOT_MET }; // Already achieved
    }
    this.state.milestoneStatuses.set(msKey, {
      achievedAt: this.mockBlockHeight,
      verifiedBy: verifier,
      payoutTriggered: false,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  triggerPayout(caller: string, innovationHash: string, revenueAmount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const agreement = this.state.agreements.get(innovationHash);
    if (!agreement) {
      return { ok: false, value: this.ERR_NO_AGREEMENT };
    }
    // Check all required milestones achieved
    const requiredMs = agreement.milestones.filter((m) => m.required);
    const allAchieved = requiredMs.every((m) => {
      const status = this.state.milestoneStatuses.get(`${innovationHash}_${m.id}`);
      return status?.achievedAt !== null;
    });
    if (!allAchieved) {
      return { ok: false, value: this.ERR_MILESTONE_NOT_MET };
    }
    // Calculate pending payouts
    agreement.contributors.forEach((c) => {
      const shareKey = `${innovationHash}_${c.contributor}`;
      const share = this.state.contributorShares.get(shareKey)!;
      const payout = Math.floor((revenueAmount * c.percentage) / 100);
      this.state.contributorShares.set(shareKey, {
        ...share,
        pendingPayouts: share.pendingPayouts + payout,
      });
    });
    return { ok: true, value: true };
  }

  tokenizeShares(caller: string, innovationHash: string, totalSupply: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const agreement = this.state.agreements.get(innovationHash);
    if (!agreement) {
      return { ok: false, value: this.ERR_NO_AGREEMENT };
    }
    if (agreement.tokenized) {
      return { ok: false, value: this.ERR_ALREADY_SIGNED }; // Reuse for already tokenized
    }
    agreement.tokenized = true;
    agreement.tokenSupply = totalSupply;
    agreement.contributors.forEach((c) => {
      const amount = Math.floor((totalSupply * c.percentage) / 100);
      this.state.tokenizedShares.set(`${innovationHash}_${c.contributor}`, {
        amount,
        lockedUntil: this.mockBlockHeight + 1000,
      });
      const shareKey = `${innovationHash}_${c.contributor}`;
      const share = this.state.contributorShares.get(shareKey)!;
      this.state.contributorShares.set(shareKey, {
        ...share,
        tokenizedAmount: amount,
      });
    });
    return { ok: true, value: true };
  }

  transferTokenizedShare(caller: string, innovationHash: string, amount: number, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const senderKey = `${innovationHash}_${caller}`;
    const senderShare = this.state.tokenizedShares.get(senderKey);
    if (!senderShare || senderShare.amount < amount) {
      return { ok: false, value: this.ERR_INVALID_TOKEN_AMOUNT };
    }
    senderShare.amount -= amount;
    const recipKey = `${innovationHash}_${recipient}`;
    const recipShare = this.state.tokenizedShares.get(recipKey) ?? { amount: 0, lockedUntil: 0 };
    recipShare.amount += amount;
    this.state.tokenizedShares.set(recipKey, recipShare);
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  getAgreement(innovationHash: string): ClarityResponse<Agreement | null> {
    return { ok: true, value: this.state.agreements.get(innovationHash) ?? null };
  }

  getContributorShare(innovationHash: string, contributor: string): ClarityResponse<ContributorShare | null> {
    return { ok: true, value: this.state.contributorShares.get(`${innovationHash}_${contributor}`) ?? null };
  }

  getMilestoneStatus(innovationHash: string, milestoneId: number): ClarityResponse<MilestoneStatus | null> {
    return { ok: true, value: this.state.milestoneStatuses.get(`${innovationHash}_${milestoneId}`) ?? null };
  }

  getTokenizedShare(innovationHash: string, holder: string): ClarityResponse<TokenizedShare | null> {
    return { ok: true, value: this.state.tokenizedShares.get(`${innovationHash}_${holder}`) ?? null };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  owner1: "owner1",
  contributor1: "contrib1",
  contributor2: "contrib2",
  verifier: "verifier",
};

describe("RoyaltyAgreement Contract", () => {
  let contract: RoyaltyAgreementMock;

  beforeEach(() => {
    contract = new RoyaltyAgreementMock();
  });

  it("should create a new agreement successfully", () => {
    const contributors: Contributor[] = [
      { contributor: accounts.contributor1, percentage: 60 },
      { contributor: accounts.contributor2, percentage: 40 },
    ];
    const milestones: Milestone[] = [
      { id: 1, description: "Phase 1", required: true, achieved: false, payoutPercentage: 50 },
    ];
    const result = contract.createAgreement(
      accounts.owner1,
      "hash1",
      contributors,
      milestones,
      2
    );
    expect(result).toEqual({ ok: true, value: true });
    const agreement = contract.getAgreement("hash1");
    expect(agreement.value?.contributors).toEqual(contributors);
  });

  it("should prevent creation if percentages don't sum to 100", () => {
    const contributors: Contributor[] = [
      { contributor: accounts.contributor1, percentage: 50 },
      { contributor: accounts.contributor2, percentage: 40 },
    ];
    const result = contract.createAgreement(
      accounts.owner1,
      "hash1",
      contributors,
      [],
      2
    );
    expect(result).toEqual({ ok: false, value: 101 });
  });

  it("should allow signing an agreement", () => {
    contract.createAgreement(
      accounts.owner1,
      "hash1",
      [{ contributor: accounts.contributor1, percentage: 100 }],
      [],
      1
    );
    const signResult = contract.signAgreement(accounts.contributor1, "hash1");
    expect(signResult).toEqual({ ok: true, value: true });
  });

  it("should achieve a milestone", () => {
    contract.createAgreement(
      accounts.owner1,
      "hash1",
      [{ contributor: accounts.contributor1, percentage: 100 }],
      [{ id: 1, description: "Test", required: true, achieved: false, payoutPercentage: 100 }],
      1
    );
    const achieveResult = contract.achieveMilestone(accounts.owner1, "hash1", 1, accounts.verifier);
    expect(achieveResult).toEqual({ ok: true, value: true });
    const status = contract.getMilestoneStatus("hash1", 1);
    expect(status.value?.achievedAt).not.toBeNull();
  });

  it("should trigger payout after milestones achieved", () => {
    contract.createAgreement(
      accounts.owner1,
      "hash1",
      [{ contributor: accounts.contributor1, percentage: 100 }],
      [{ id: 1, description: "Test", required: true, achieved: false, payoutPercentage: 100 }],
      1
    );
    contract.achieveMilestone(accounts.owner1, "hash1", 1, accounts.verifier);
    const payoutResult = contract.triggerPayout(accounts.owner1, "hash1", 10000);
    expect(payoutResult).toEqual({ ok: true, value: true });
    const share = contract.getContributorShare("hash1", accounts.contributor1);
    expect(share.value?.pendingPayouts).toBe(10000);
  });

  it("should tokenize shares", () => {
    contract.createAgreement(
      accounts.owner1,
      "hash1",
      [{ contributor: accounts.contributor1, percentage: 100 }],
      [],
      1
    );
    const tokenizeResult = contract.tokenizeShares(accounts.owner1, "hash1", 1000000);
    expect(tokenizeResult).toEqual({ ok: true, value: true });
    const share = contract.getTokenizedShare("hash1", accounts.contributor1);
    expect(share.value?.amount).toBe(1000000);
  });

  it("should transfer tokenized shares", () => {
    contract.createAgreement(
      accounts.owner1,
      "hash1",
      [{ contributor: accounts.contributor1, percentage: 100 }],
      [],
      1
    );
    contract.tokenizeShares(accounts.owner1, "hash1", 1000000);
    const transferResult = contract.transferTokenizedShare(accounts.contributor1, "hash1", 500000, accounts.contributor2);
    expect(transferResult).toEqual({ ok: true, value: true });
    const senderShare = contract.getTokenizedShare("hash1", accounts.contributor1);
    expect(senderShare.value?.amount).toBe(500000);
    const recipShare = contract.getTokenizedShare("hash1", accounts.contributor2);
    expect(recipShare.value?.amount).toBe(500000);
  });

  it("should pause and unpause the contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const createDuringPause = contract.createAgreement(
      accounts.owner1,
      "hash1",
      [],
      [],
      1
    );
    expect(createDuringPause).toEqual({ ok: false, value: 108 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });
});