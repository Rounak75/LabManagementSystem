import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const dbPath = path.join(process.env.APPDATA || "", "@lab/desktop/lab.sqlite");
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${dbPath}` } }
});

async function main() {
  console.log("Reading legacy JSON files...");
  
  const doctorsPath = "C:/Users/Rouna/.gemini/antigravity-ide/brain/85860341-200b-4e88-b900-5f15c79d5993/scratch/doctors.json";
  const testsPath = "C:/Users/Rouna/.gemini/antigravity-ide/brain/85860341-200b-4e88-b900-5f15c79d5993/scratch/tests.json";

  const doctorsData = JSON.parse(fs.readFileSync(doctorsPath, "utf8").replace(/^\uFEFF/, ""));
  const testsData = JSON.parse(fs.readFileSync(testsPath, "utf8").replace(/^\uFEFF/, ""));

  console.log(`Found ${doctorsData.length} doctors and ${testsData.length} tests.`);

  // Import Doctors
  const newDoctors = doctorsData
    .filter((d: any) => d.name && d.name.trim() !== "")
    .map((d: any) => ({
      name: d.name.trim(),
      clinic: null,
      isActive: true,
    }));
  
  if (newDoctors.length > 0) {
    console.log("Importing doctors...");
    const res = await prisma.doctor.createMany({
      data: newDoctors,
    });
    console.log(`Imported ${res.count} doctors.`);
  }

  // Import Tests
  const newTests = testsData
    .filter((t: any) => t.desc && t.desc.trim() !== "")
    .map((t: any) => {
      let price = Number(t.rate);
      if (isNaN(price)) price = 0;
      
      return {
        name: t.desc.trim(),
        category: "Other", // Defaulting to Other
        price: price,
        isOutsourced: false,
        isActive: true,
      };
    });
  
  if (newTests.length > 0) {
    console.log("Importing tests...");
    const res = await prisma.test.createMany({
      data: newTests,
    });
    console.log(`Imported ${res.count} tests.`);
  }

  console.log("Migration complete.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
