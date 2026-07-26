// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TipJar - Transparent Web3 Micro-Tipping Contract for Creators
 * @dev Allows supporters to tip ETH with a message. All tips emit on-chain events.
 */
contract TipJar {
    address payable public immutable owner;
    uint256 public totalTipsCount;
    uint256 public totalAmountTipped;

    struct Tip {
        address sender;
        uint256 amount;
        string message;
        uint256 timestamp;
    }

    Tip[] private tips;

    /// @notice Emitted whenever a supporter sends a tip
    event NewTip(
        address indexed sender,
        uint256 amount,
        string message,
        uint256 timestamp
    );

    /// @notice Emitted when the contract owner withdraws funds
    event BalanceWithdrawn(address indexed owner, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "TipJar: Only owner can withdraw funds");
        _;
    }

    constructor() {
        owner = payable(msg.sender);
    }

    /**
     * @notice Send a tip with an optional supporter message
     * @param _message Short message from the supporter (max 280 chars)
     */
    function tip(string calldata _message) external payable {
        require(msg.value > 0, "TipJar: Tip amount must be greater than 0");
        require(bytes(_message).length <= 280, "TipJar: Message exceeds 280 characters limit");

        tips.push(Tip({
            sender: msg.sender,
            amount: msg.value,
            message: _message,
            timestamp: block.timestamp
        }));

        totalTipsCount += 1;
        totalAmountTipped += msg.value;

        emit NewTip(msg.sender, msg.value, _message, block.timestamp);
    }

    /**
     * @notice Get all recorded tips array
     * @return Array of Tip structs
     */
    function getTips() external view returns (Tip[] memory) {
        return tips;
    }

    /**
     * @notice Returns total number of tips recorded
     */
    function getTipsCount() external view returns (uint256) {
        return tips.length;
    }

    /**
     * @notice Withdraw accumulated tip balance to creator wallet
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "TipJar: No ETH available to withdraw");

        (bool success, ) = owner.call{value: balance}("");
        require(success, "TipJar: ETH transfer failed");

        emit BalanceWithdrawn(owner, balance);
    }

    /**
     * @dev Fallback to receive direct ETH tips
     */
    receive() external payable {
        require(msg.value > 0, "TipJar: Tip amount must be greater than 0");
        
        string memory defaultMsg = "Direct ETH Tip";
        tips.push(Tip({
            sender: msg.sender,
            amount: msg.value,
            message: defaultMsg,
            timestamp: block.timestamp
        }));

        totalTipsCount += 1;
        totalAmountTipped += msg.value;

        emit NewTip(msg.sender, msg.value, defaultMsg, block.timestamp);
    }
}
