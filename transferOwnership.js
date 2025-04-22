const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// Full drive scope is needed for ownership transfer
const SCOPES = ["https://www.googleapis.com/auth/drive"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) return client;
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) await saveCredentials(client);
  return client;
}

async function transferOwnership(fileId, newOwnerEmail) {
  const authClient = await authorize();
  const drive = google.drive({ version: "v3", auth: authClient });

  try {
    console.log(
      `Starting ownership transfer process for file ${fileId} to ${newOwnerEmail}`
    );

    // Step 1: Check if user already has access and get their permission ID
    console.log("Checking existing permissions...");
    const permissionResponse = await drive.permissions.list({
      fileId: fileId,
      fields: "permissions(id,emailAddress,role)",
    });

    const permissions = permissionResponse.data.permissions;
    console.log("Current permissions:", JSON.stringify(permissions, null, 2));

    let targetPermissionId = null;

    // Look for existing permission for the target email
    const existingPermission = permissions.find(
      (p) =>
        p.emailAddress &&
        p.emailAddress.toLowerCase() === newOwnerEmail.toLowerCase()
    );

    if (existingPermission) {
      console.log(
        `User ${newOwnerEmail} already has access with role: ${existingPermission.role}`
      );
      targetPermissionId = existingPermission.id;
    } else {
      // Step 2: If no access, create permission with writer role first
      console.log(`Adding ${newOwnerEmail} as editor first...`);
      const createResponse = await drive.permissions.create({
        fileId: fileId,
        sendNotificationEmail: true,
        requestBody: {
          role: "writer",
          type: "user",
          emailAddress: newOwnerEmail,
        },
      });

      targetPermissionId = createResponse.data.id;
      console.log(`Created new permission with ID: ${targetPermissionId}`);
    }

    // Step 3: Attempt to transfer ownership
    console.log(
      `Attempting to transfer ownership using permission ID: ${targetPermissionId}`
    );
    const transferResponse = await drive.permissions.update({
      fileId: fileId,
      permissionId: targetPermissionId,
      transferOwnership: true,
      requestBody: {
        role: "owner",
      },
    });

    console.log("Ownership transfer successful!");
    console.log(transferResponse.data);
  } catch (err) {
    console.error("Error during ownership transfer:");
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(`Error data:`, err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

// If your file is testfile.json from your screenshot
// Get the file ID from the URL
// It should be in the URL path looking like: /d/FILE_ID_HERE/
const fileId = "1n0sK0z9LKcQuUeruRpBLb4mO0C2S0sWD"; // Update this with your actual file ID
const newOwnerEmail = "qjlobacala@tip.edu.ph";

// Run the transfer function
transferOwnership(fileId, newOwnerEmail);
