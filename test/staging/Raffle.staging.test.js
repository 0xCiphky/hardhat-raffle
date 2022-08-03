//staging test should only run on a test network

const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../../helper-hardhat-config")

//if it is not a currently on a development chain then skip this describe
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", function () {
          let raffle, deployer, entranceFee

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              entranceFee = await raffle.getEntryFee()
          })
          describe("fulfillRandomWords", () => {
              it("works with live chainlink keepers and chainlink vrf, we get a random winner", async () => {
                  const starttingTimeStamp = await raffle.getLastTimeStamp()
                  const accounts = await ethers.getSigners()

                  //set up a listener before we enter the raffle, just in case the blockchain moves really fast

                  await new Promise(async (resolve, reject) => {
                      raffle.once("winnerPicked", async () => {
                          console.log("winner picked")
                          //once we get the winner picked we can start doing our asserts
                          try {
                              //add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              //deployers account is accounts 0
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()

                              //check if the players array is reset
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              //this should revert as there is no players
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState.toString(), "0")

                              //check if winner received the money
                              //we only have one entrant the deployer, so he shuld get back what he put in
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(entranceFee.toString())
                              )
                              //  check if the timestamp got reset
                              assert(endingTimeStamp > starttingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })
                      //enter the raffle
                      await raffle.enterRaffle({ value: entranceFee })
                      const winnerStartingBalance = await accounts[0].getBalance()

                      //This code will not complete until our listener has finished listening
                  })
              })
          })
      })
