const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");
const _ = require("lodash");
const readlineSync = require("readline-sync");
const chalk = require("chalk");
const log = console.log;

const TEMPLATES_DIR = path.join(__dirname, "templates");

function capitalize(string) {
  return _.capitalize(string);
}

function uncapitalize(string) {
  return _.camelCase(string);
}

Handlebars.registerHelper("capitalize", capitalize);
Handlebars.registerHelper("uncapitalize", uncapitalize);
Handlebars.registerHelper("toLowerCase", (str) => str.toLowerCase());
Handlebars.registerHelper("replace", (str, find, replace) =>
  str.replace(new RegExp(find, "g"), replace)
);
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("ne", (a, b) => a !== b);
Handlebars.registerHelper("or", (...args) => {
  const conditions = args.slice(0, -1);
  return conditions.some(Boolean);
});
Handlebars.registerHelper("and", (...args) => {
  const conditions = args.slice(0, -1);
  return conditions.every(Boolean);
});
Handlebars.registerHelper("not", (condition) => !condition);

async function generateComponent(
  outputBasePath,
  templateName,
  outputSubPath,
  fileName,
  data
) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  // ? Ensure template file exists before trying to read it
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  const templateContent = fs.readFileSync(templatePath, "utf8");
  const compiledTemplate = Handlebars.compile(templateContent);

  const outputPath = path.join(outputBasePath, outputSubPath);
  fs.mkdirSync(outputPath, { recursive: true });

  const outputFile = path.join(outputPath, fileName);
  fs.writeFileSync(outputFile, compiledTemplate(data), "utf8");
  console.log(`Generated: ${outputFile}`);
}

async function runGenerator() {
  const defaultOutputPath = "./generated-src/main/java/";

  log(
    chalk.cyanBright.bold(
      "\n=== Gerador de Componentes Spring Boot (Node.js) ===\n"
    )
  );

  let outputBasePath =
    readlineSync
      .question(
        chalk.yellow(
          `📁 Enter output base path [default: ${defaultOutputPath}]: `
        )
      )
      .trim() || defaultOutputPath;

  // ? Normalize path to ensure consistency across different operating systems.
  outputBasePath = path.normalize(outputBasePath);
  // ! Ensure it ends with a path separator for consistent directory creation.
  if (!outputBasePath.endsWith(path.sep)) {
    outputBasePath += path.sep;
  }

  const basePackageName =
    readlineSync
      .question(
        chalk.green(
          "📦 Enter Base Package Name (e.g., com.example, org.myproject): "
        )
      )
      .trim() || "com.example"; // Default base package

  // ! Validate base package name to ensure it's a valid Java package structure.
  // ? This regex allows for multiple segments separated by dots.
  if (!/^[a-z]+(\.[a-z]+)*$/.test(basePackageName)) {
    log(
      chalk.red(
        "❌ Invalid base package name. Must be lowercase and dot-separated (e.g., com.example)."
      )
    );
    return;
  }

  const entityName = readlineSync
    .question(chalk.green("🔤 Enter Entity Name (e.g., Post, User): "))
    .trim();

  if (!entityName) {
    log(chalk.red("❌ Entity name cannot be empty."));
    return;
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(entityName)) {
    log(
      chalk.red(
        "❌ Invalid entity name. Must be a valid Java identifier (e.g., no spaces, special characters, cannot start with a number)."
      )
    );
    return;
  }

  const uncapitalizedEntityName = uncapitalize(entityName);
  // ! Construct package name using dot notation for Java.
  const entityPackage = `${basePackageName}.${uncapitalizedEntityName}`;

  const fields = [
    {
      name: "id",
      type: "String", // ? Consider making 'id' type configurable (e.g., Long, UUID)
      isId: true,
      isRequired: false,
      includeInDto: true,
    },
  ];

  // * Use a Set for faster lookups and better readability for valid types.
  // ! Added BigDecimal for precise monetary values.
  const VALID_FIELD_TYPES = new Set([
    "String",
    "int",
    "LocalDate",
    "boolean",
    "long",
    "Date",
    "LocalDateTime",
    "Instant",
    "UUID",
    "Double",
    "Float",
    "BigDecimal", // ? Added BigDecimal for precise monetary values
  ]);

  while (true) {
    log(chalk.blueBright("\n➕ Add New Field"));
    const addField = readlineSync
      .question(chalk.yellow("➕ Add new field? (y/n): "))
      .trim()
      .toLowerCase();

    if (addField !== "y") break;

    const fieldName = readlineSync
      .question(chalk.green("📝 Field Name: "))
      .trim();
    if (!fieldName || fieldName.toLowerCase() === "id") {
      log(chalk.red("⚠️ Field name cannot be empty or 'id'. Skipping."));
      continue;
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(fieldName)) {
      log(
        chalk.red(
          "❌ Invalid field name. Must be a valid Java identifier. Skipping."
        )
      );
      continue;
    }

    const fieldType = readlineSync
      .question(
        chalk.green(
          "🔠 Field Type (e.g., String, int, LocalDate, BigDecimal): "
        )
      )
      .trim();

    if (!fieldType || !VALID_FIELD_TYPES.has(fieldType)) {
      log(
        chalk.red(
          `⚠️ Unsupported or empty field type: ${fieldType}. Please choose from: ${Array.from(
            VALID_FIELD_TYPES
          ).join(", ")}. Skipping.`
        )
      );
      continue;
    }

    const isRequired =
      readlineSync
        .question(chalk.yellow("❓ Is field required? (y/n): "))
        .trim()
        .toLowerCase() === "y";

    const includeInDto =
      readlineSync
        .question(chalk.yellow("📦 Include in DTO? (y/n): "))
        .trim()
        .toLowerCase() === "y";

    fields.push({
      name: fieldName,
      type: fieldType,
      isId: false,
      isRequired,
      includeInDto,
    });
  }

  const templateData = {
    entityName: _.capitalize(entityName),
    uncapitalizedEntityName,
    packageName: entityPackage, // Now in dot notation (e.g., com.example.post)
    fields,
    fieldsForDto: fields.filter((f) => f.includeInDto && !f.isId),
    hasRequiredFieldInDto: fields.some(
      (f) => f.includeInDto && f.isRequired && !f.isId
    ),
    basePackage: basePackageName, // Added for potential use in templates
  };

  try {
    log(chalk.magenta("\n📁 Generating entity..."));
    await generateComponent(
      outputBasePath,
      "Entity.js.hbs",
      // ! Convert package name (dot notation) to path (slash notation) for directories
      templateData.packageName.replace(/\./g, path.sep),
      `${templateData.entityName}.java`,
      templateData
    );

    log(chalk.magenta("📦 Generating DTO..."));
    await generateComponent(
      outputBasePath,
      "DTO.js.hbs",
      `${templateData.packageName.replace(/\./g, path.sep)}${path.sep}dto`,
      `${templateData.entityName}DTO.java`,
      templateData
    );

    log(chalk.magenta("📚 Generating repository..."));
    await generateComponent(
      outputBasePath,
      "Repository.js.hbs",
      `${templateData.packageName.replace(/\./g, path.sep)}${
        path.sep
      }repository`,
      `${templateData.entityName}Repository.java`,
      templateData
    );

    log(chalk.magenta("⚙️ Generating service..."));
    await generateComponent(
      outputBasePath,
      "Service.js.hbs",
      `${templateData.packageName.replace(/\./g, path.sep)}${path.sep}service`,
      `${templateData.entityName}Service.java`,
      templateData
    );

    log(chalk.magenta("🌐 Generating controller..."));
    await generateComponent(
      outputBasePath,
      "Controller.js.hbs",
      `${templateData.packageName.replace(/\./g, path.sep)}${
        path.sep
      }controller`,
      `${templateData.entityName}Controller.java`,
      templateData
    );

    log(
      chalk.greenBright(
        `\n✅ Components generated successfully for entity: ${entityName}`
      )
    );
    log(chalk.green(`📂 Check folder: ${outputBasePath}\n`));
  } catch (error) {
    log(chalk.red("❌ Error generating files:", error.message));
    console.error(error);
  } finally {
    const showContributionOptions = readlineSync
      .question(
        chalk.yellow(
          "\n🙏 Would you like to contribute to this project? (y/n): "
        )
      )
      .trim()
      .toLowerCase();

    if (showContributionOptions === "y") {
      log(chalk.cyanBright("\n--- How to Support This Project ---"));
      log(
        chalk.white("Your contribution helps maintain and improve this tool.")
      );
      log(
        chalk.greenBright("⭐ Star on GitHub: ") +
          chalk.blueBright("https://github.com/lucaserm/seu-repositorio")
      );
      log(
        chalk.greenBright("💰 Donate via Pix: ") +
          chalk.blueBright("lucas.macedo@ufms.br")
      );
      log(chalk.white("Thank you for your support!\n"));
    }
  }
}

runGenerator();
