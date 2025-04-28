import {
  createPublicClient,
  encodeFunctionData,
  hashMessage,
  http,
  zeroAddress,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  Implementation,
  toMetaMaskSmartAccount,
} from "@metamask/delegation-toolkit";
import {
  createBundlerClient,
  createPaymasterClient,
} from "viem/account-abstraction";

const PRIVATE_KEY = generatePrivateKey();
const PAYMASTER_URL =
  "https://api.pimlico.io/v2/11155111/rpc?apikey=<PIMLICO_API_KEY>";

(async () => {
  const signatoryAccount = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [signatoryAccount.address, [], [], []],
    deploySalt: "0x",
    signatory: { account: signatoryAccount },
  });

  if (!(await smartAccount.isDeployed())) {
    console.log("Deploying smart account...", await smartAccount.getAddress());

    const paymaster = createPaymasterClient({
      transport: http(PAYMASTER_URL),
    });

    const bundlerClient = createBundlerClient({
      client: publicClient,
      transport: http(PAYMASTER_URL),
      paymaster,
    });

    const { fast: gasPrice } = (await bundlerClient.request({
      method: "pimlico_getUserOperationGasPrice",
    } as any)) as any;

    const hash = await bundlerClient.sendUserOperation({
      account: smartAccount,
      calls: [
        {
          to: zeroAddress,
        },
      ],
      ...gasPrice,
    });

    await bundlerClient.waitForUserOperationReceipt({
      hash,
    });

    console.log("Smart account deployed at:", await smartAccount.getAddress());
  }

  const message = "Hello, MetaMask Delegation!";
  const signature = await smartAccount.signMessage({
    message,
  });

  const messageHash = await hashMessage(message);

  console.log("Message signature:", signature);
  console.log("Message hash:", messageHash);

  const isValidSignatureData = encodeFunctionData({
    abi: [
      {
        name: "isValidSignature",
        type: "function",
        inputs: [
          { name: "_hash", type: "bytes32" },
          { name: "_signature", type: "bytes" },
        ],
        outputs: [{ type: "bytes4" }],
        stateMutability: "view",
      },
    ],
    functionName: "isValidSignature",
    args: [messageHash, signature],
  });

  const { data: isValidSignature } = await publicClient.call({
    account: smartAccount.address,
    data: isValidSignatureData,
    to: smartAccount.address,
  });

  console.log("Message signature:", signature);
  console.log("Message hash:", messageHash);
  console.log("isValidSignatureCall:", isValidSignature); // should be EIP1271_MAGIC_VALUE(0x1626ba7e)
})();
