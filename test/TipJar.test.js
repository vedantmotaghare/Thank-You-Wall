import { expect } from "chai";
import hre from "hardhat";

describe("TipJar Contract", function () {
  let tipJar;
  let owner;
  let supporter1;
  let supporter2;

  beforeEach(async function () {
    [owner, supporter1, supporter2] = await hre.ethers.getSigners();
    const TipJarFactory = await hre.ethers.getContractFactory("TipJar");
    tipJar = await TipJarFactory.deploy();
    await tipJar.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct contract owner", async function () {
      expect(await tipJar.owner()).to.equal(owner.address);
    });

    it("Should start with zero total tips count and zero total amount", async function () {
      expect(await tipJar.totalTipsCount()).to.equal(0);
      expect(await tipJar.totalAmountTipped()).to.equal(0);
    });
  });

  describe("Tipping Functionality", function () {
    it("Should record tip details and emit NewTip event", async function () {
      const tipAmount = hre.ethers.parseEther("0.05");
      const message = "Loving the weekly comic strips! Keep it up!";

      const tx = await tipJar.connect(supporter1).tip(message, { value: tipAmount });
      const receipt = await tx.wait();

      // Check event emission
      await expect(tx)
        .to.emit(tipJar, "NewTip")
        .withArgs(supporter1.address, tipAmount, message, (await hre.ethers.provider.getBlock(receipt.blockNumber)).timestamp);

      // Verify state update
      expect(await tipJar.totalTipsCount()).to.equal(1);
      expect(await tipJar.totalAmountTipped()).to.equal(tipAmount);

      const tips = await tipJar.getTips();
      expect(tips.length).to.equal(1);
      expect(tips[0].sender).to.equal(supporter1.address);
      expect(tips[0].amount).to.equal(tipAmount);
      expect(tips[0].message).to.equal(message);
    });

    it("Should revert if tip amount is 0 ETH", async function () {
      await expect(
        tipJar.connect(supporter1).tip("Great comic!", { value: 0 })
      ).to.be.revertedWith("TipJar: Tip amount must be greater than 0");
    });

    it("Should revert if message length exceeds 280 characters", async function () {
      const longMessage = "a".repeat(281);
      const tipAmount = hre.ethers.parseEther("0.01");

      await expect(
        tipJar.connect(supporter1).tip(longMessage, { value: tipAmount })
      ).to.be.revertedWith("TipJar: Message exceeds 280 characters limit");
    });

    it("Should accept direct ETH transfer via receive fallback", async function () {
      const tipAmount = hre.ethers.parseEther("0.02");

      const tx = await supporter2.sendTransaction({
        to: await tipJar.getAddress(),
        value: tipAmount,
      });

      await expect(tx)
        .to.emit(tipJar, "NewTip")
        .withArgs(supporter2.address, tipAmount, "Direct ETH Tip", (await hre.ethers.provider.getBlock(tx.blockNumber)).timestamp);

      expect(await tipJar.totalTipsCount()).to.equal(1);
      expect(await tipJar.totalAmountTipped()).to.equal(tipAmount);
    });
  });

  describe("Withdrawal Functionality", function () {
    beforeEach(async function () {
      const tipAmount = hre.ethers.parseEther("1.0");
      await tipJar.connect(supporter1).tip("First supporter tip!", { value: tipAmount });
    });

    it("Should allow the owner to withdraw full contract balance", async function () {
      const initialOwnerBalance = await hre.ethers.provider.getBalance(owner.address);
      const contractBalance = await hre.ethers.provider.getBalance(await tipJar.getAddress());

      const tx = await tipJar.connect(owner).withdraw();
      const receipt = await tx.wait();

      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const finalOwnerBalance = await hre.ethers.provider.getBalance(owner.address);

      expect(finalOwnerBalance).to.equal(initialOwnerBalance + contractBalance - gasUsed);
      expect(await hre.ethers.provider.getBalance(await tipJar.getAddress())).to.equal(0);
    });

    it("Should revert withdrawal attempts by non-owners", async function () {
      await expect(
        tipJar.connect(supporter1).withdraw()
      ).to.be.revertedWith("TipJar: Only owner can withdraw funds");
    });

    it("Should revert withdrawal if contract balance is 0", async function () {
      await tipJar.connect(owner).withdraw();
      await expect(
        tipJar.connect(owner).withdraw()
      ).to.be.revertedWith("TipJar: No ETH available to withdraw");
    });
  });
});
