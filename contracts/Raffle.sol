// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/// @title hardhat raffle contract
/// @author Areez Ladhani
/// @notice This contract is for creating a simple raffle contract
/// @dev Contract uses chainlink vrf and chainlink keepers

/* NOTES */
// function for player to enter raffle
// function to pick a random winner thorugh chainlink vrf
// function to automate the process through chainlink keepers

/* imports */
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";

/* errors */
error Raffle__notEnoughFunds();
error Raffle__upKeepNotNeeded(uint256 balance, uint256 numOfPlayers, uint256 state);
error Raffle__notPayed();
error Raffle__notOpen();

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* chainlink variables */
    VRFCoordinatorV2Interface private immutable i_VRFCoordinator;
    bytes32 private immutable i_keyHash;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFRIMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 1;

    /* lottery variables */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    enum raffleState {
        open,
        calculating
    }
    raffleState private s_raffleState;
    uint256 private immutable i_interval;
    uint256 private s_lastTimeStamp;
    address private s_lastWinner;

    /* events */
    event raffleEnter(address indexed player);
    event requestedNumberPicked(uint256 requestId);
    event winnerPicked(address indexed winner);

    constructor(
        uint256 entranceFee,
        address vrfCoordinator,
        bytes32 keyHash,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinator) {
        i_entranceFee = entranceFee;
        i_VRFCoordinator = VRFCoordinatorV2Interface(vrfCoordinator);
        i_keyHash = keyHash;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = raffleState.open;
        i_interval = interval;
        s_lastTimeStamp = block.timestamp;
    }

    /// @notice This function lets players enter the raffle
    /// @dev checks if player has sent enough money and raffle is open,
    /// if conditions are met player is added to s_players (variable with all players) and an event is emitted
    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__notEnoughFunds();
        }
        if (s_raffleState != raffleState.open) {
            revert Raffle__notOpen();
        }
        s_players.push(payable(msg.sender));
        emit raffleEnter(msg.sender);
    }

    /// @notice checks to see if all conditions to close the raffle are met
    /// @dev This function uses chainlink keepers to check four main conditions:
    ///At least 1 player in raffle
    ///bal > 0 in contract
    ///raffle state is open
    /// interval time has passed
    /// @return upkeepNeeded bool that returns true if all conditions to close the raaffle are met
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool checkBal = (address(this).balance > 0);
        bool enoughPlayers = (s_players.length > 0);
        bool raffleOpen = (s_raffleState == raffleState.open);
        bool intervalPassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        upkeepNeeded = (checkBal && enoughPlayers && raffleOpen && intervalPassed);
        // We don't use the checkData in this example. The checkData is defined when the Upkeep was registered.
    }

    // Assumes the subscription is funded sufficiently.
    /// @notice if all conditions are met to end raffle, closes the raffle, generates random number
    /// @dev uses chainlink vrf to request a random uint256
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__upKeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        //close the raffle
        s_raffleState = raffleState.calculating;
        // Will revert if subscription is not set and funded.
        uint256 requestId = i_VRFCoordinator.requestRandomWords(
            i_keyHash,
            i_subscriptionId,
            REQUEST_CONFRIMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit requestedNumberPicked(requestId);
    }

    /// @notice Picks a winner, resets the variables, send the prize to the winner
    /// @dev uses the random number generated in the performUpKeep func to pick a winner
    /// resets all the variables to start a new raffle, sends all funds from contract to winner, emits event
    /// @param randomWords Array that stores all randomword generated by chainlink vrf
    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_lastWinner = recentWinner;

        //reset the variables
        s_players = new address payable[](0);
        s_raffleState = raffleState.open;
        s_lastTimeStamp = block.timestamp;

        //send raffle prize to winner
        (bool payed, ) = recentWinner.call{value: address(this).balance}("");
        if (!payed) {
            revert Raffle__notPayed();
        }
        //emit event that a winner was picked
        emit winnerPicked(recentWinner);
    }

    /* getter functions */
    /// @notice Returns the entry fee of the raffle.
    function getEntryFee() public view returns (uint256) {
        return i_entranceFee;
    }

    /// @notice Returns a specific player from the raffle given a index
    function getPlayer(uint256 _index) public view returns (address) {
        return s_players[_index];
    }

    /// @notice Returns the the latest winner of the raffle
    function getRecentWinner() public view returns (address) {
        return s_lastWinner;
    }

    /// @notice Returns the raffle state (open or calculating)
    function getRaffleState() public view returns (raffleState) {
        return s_raffleState;
    }

    /// @notice Returns the num of random words, from chainlink vrf
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    /// @notice Returns the num of request confirmation for chainlink vrf
    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFRIMATIONS;
    }

    /// @notice Returns the last timestamp (when raffle started)
    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    /// @notice Returns the time interval, how long the raffle will run for
    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    /// @notice Returns the number of players in the raffle
    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }
}
