const { assert, expect } = require("chai")
const { network, getNamedAccounts, ethers, deployments } = require("hardhat")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", () => {
          let entranceFee, enterRaffle, raffle
          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              chainId = network.config.chainId

              await deployments.fixture(["all"])

              raffle = await ethers.getContract("Raffle", deployer)
              console.log("test")
              VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              entranceFee = await raffle.getEntryFee()
              interval = await raffle.getInterval()
          })
          describe("constructor", () => {
              it("Checks if the entrance fee is set correctly", async () => {
                  assert.equal(entranceFee.toString(), ethers.utils.parseEther("0.01"))
              })
          })

          describe("enterRaffle", () => {
              it("Doesn't let you enter raffle if entry fee is not paid", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__notEnoughFunds()")
              })
              it("Lets you enter raffle, if entry fee is paid", async () => {
                  enterRaffle = await raffle.enterRaffle({ value: entranceFee })
                  assert(enterRaffle)
              })
              it("emits an event, when a player enters the raffle", async () => {
                  expect(await raffle.enterRaffle({ value: entranceFee })).to.emit("raffleEnter")
              })
              it("adds player to the players array, once entered raffle", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  playerEntered = await raffle.getPlayer(0)
                  assert.equal(deployer, playerEntered)
              })
          })
          describe("checkUpKeep", () => {
              it("returns false if not players/balance in raffle while other conditions satisfied", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //0x is a way to send a blank bytes object
                  // can use 0x or [ ]

                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  //this will give us the return vars of checkUpKeep (2 but we only need 1)
                  assert(!upkeepNeeded)
              })
              it("returns false if enough time hasn't passed while other conditions satisfied", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //0x is a way to send a blank bytes object
                  // can use 0x or [ ]
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns true if all conditions are met", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(upkeepNeeded, true)
              })
          })
          describe("performUpKeep", () => {
              it("can only run if checkUpKeep is true", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
                  //if tx has no erros and the function runs this will pass
              })

              it("reverts when checkUpKeep is false", async () => {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__upKeepNotNeeded"
                      //we can add the params of the error but this is good enough too
                  )
              })
              it("updates the raffle state, calls the vrfcoordinator", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  const txResponse = await raffle.performUpkeep("0x") // emits requestId
                  const txReceipt = await txResponse.wait(1) // waits 1 block
                  //console.log(txReceipt)
                  const raffleState = await raffle.getRaffleState() // updates state
                  const requestId = txReceipt.events[1].args[0]
                  //console.log(`request: ${requestId}`)
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1) // 0 = open, 1 = calculating
              })
              it("emits an event with requestId, if successfull", async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  expect(raffle.callStatic.checkUpkeep([])).to.emit("requestedNumberPicked")
              })
          })
          describe("fulfillRandomWords", () => {
              //we will have a beforeEach here
              //we want someone to have entered the raffle before we run our tests
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: entranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpKeep", async () => {
                  expect(VRFCoordinatorV2Mock.fulfillRandomWords(0, raffle)).to.be.revertedWith(
                      "nonexistant request"
                  )
                  //check with request id of 1
                  expect(VRFCoordinatorV2Mock.fulfillRandomWords(1, raffle)).to.be.revertedWith(
                      "nonexistant request"
                  )
              })
              it("picks a winner, resets the lottery, sends the money", async () => {
                  //we will use 3 extra accounts in this section for testing
                  const additionEntrants = 3
                  const startingAccountIndex = 1 //since deployer is account 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: entranceFee })
                  }
                  //There are now 4 people in our raffle
                  const starttingTimeStamp = await raffle.getLastTimeStamp()
                  //mock upKeep (perform chainlink keepers)
                  // fulfillRandomWords (mock being chainlink vrf )
                  await new Promise(async (resolve, reject) => {
                      //once raffle.winner picked event gets emitted
                      raffle.once("winnerPicked", async () => {
                          console.log("Found the event")
                          try {
                              //checking if recentwinner is right
                              // players, rafflestate, timestamp has been reset

                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner)
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[1].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(entranceFee.mul(additionEntrants).add(entranceFee))
                                      .toString()
                              )
                              assert(endingTimeStamp > starttingTimeStamp)
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      //setting up the listener
                      //below, we will fire up the event, and the listener will pick it up, and resolve

                      //This part mocks the chainlink keeprs
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const startingBalance = await accounts[1].getBalance()

                      //we get the vrfcoordinatormock to call fulfillrandom words (from the vrfcoordinationmock.sol not raffle.sol)
                      //fulfill randomwords takes in two params (requestId and address)
                      //console.log(txReceipt.events[1].args[0])
                      //console.log(txReceipt.events[1].args.requestedID)

                      //This part mocks the chainlink vrf
                      await VRFCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args[0],
                          raffle.address
                      )

                      //once this function above is called it will emit a winner picked event
                      //which gets picked up by our  (raffle.once) func above
                  })
              })
          })
      })
