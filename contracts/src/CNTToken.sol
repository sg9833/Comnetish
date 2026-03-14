// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title CNTToken
 * @notice Simple mintable ERC-20 token used for Comnetish demo/testing scenarios.
 * @dev This contract intentionally keeps a small surface area for local test environments.
 */
contract CNTToken {
    /**
     * @notice Name of the token.
     */
    string public name;

    /**
     * @notice Symbol of the token.
     */
    string public symbol;

    /**
     * @notice Number of decimals used by token amounts.
     */
    uint8 public immutable decimals;

    /**
     * @notice Total token supply in smallest units.
     */
    uint256 public totalSupply;

    /**
     * @notice Contract owner with mint permission.
     */
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed tokenOwner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error InvalidAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    /**
     * @notice Creates a new token instance.
     * @param tokenName Human-readable token name.
     * @param tokenSymbol Symbol used by wallets and explorers.
     * @param tokenDecimals Decimals precision for token amounts.
     */
    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals) {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /**
     * @notice Transfers ownership to another account.
     * @param newOwner Address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Mints new tokens to the specified recipient.
     * @param to Recipient address.
     * @param amount Amount to mint in smallest units.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /**
     * @notice Transfers tokens to another address.
     * @param to Recipient address.
     * @param amount Amount to transfer.
     * @return True when successful.
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Sets spender allowance for caller tokens.
     * @param spender Spender address.
     * @param amount Allowance amount.
     * @return True when successful.
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfers tokens using an existing allowance.
     * @param from Address to spend tokens from.
     * @param to Recipient address.
     * @param amount Amount to transfer.
     * @return True when successful.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }

        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
    }
}
