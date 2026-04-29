import { allTools } from '../src/tools/index';

async function test() {
  console.log("Testing treeView...");
  const result = await allTools.treeView.execute({ depth: 2 });
  console.log(JSON.stringify(result, null, 2));
}

test();
