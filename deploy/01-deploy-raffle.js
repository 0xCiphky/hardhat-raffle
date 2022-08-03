const { deployments, getNamedAccounts, network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2")

module.exports = async function ({ deployments, getNamedAccounts }) {
    let VRFCoordinatorV2Address, subscriptionId
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    if (developmentChains.includes(network.name)) {
        const VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
        VRFCoordinatorV2Address = VRFCoordinatorV2Mock.address

        //create a subscription Id mock
        const transactionResponse = await VRFCoordinatorV2Mock.createSubscription()

        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId

        //fund the subscription
        //on a real network, you would need the link token
        await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        VRFCoordinatorV2Address = networkConfig[chainId]["VRFCoordinatorV2Address"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const keyHash = networkConfig[chainId]["keyHash"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]
    const { verify } = require("../utils/verify")

    const args = [
        entranceFee,
        VRFCoordinatorV2Address,
        keyHash,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("verifying...")
        await verify(raffle.address, args)
    }
    log("----------------------------------------")
}

module.exports.tags = ["raffle", "all"]
