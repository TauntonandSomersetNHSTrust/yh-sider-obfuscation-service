const Fastify = require("fastify");
const nock = require("nock");
const plugin = require(".");

/**
 * Refer to option documentation here:
 * https://github.com/keycloak/keycloak-documentation/blob/main/securing_apps/topics/token-exchange/token-exchange.adoc
 */
const testKeycloakConfig = {
	enabled: true,
	requestToken: {
		form: {
			audience: "mock-audience",
			client_id: "mock-id",
			client_secret: "mock-secret",
			grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
			requested_token_type:
				"urn:ietf:params:oauth:token-type:access_token",
		},
		url: "https://sso.somersetft.nhs.uk/token",
	},
	serviceAuthorisation: {
		form: {
			client_id: "mock-id",
			client_secret: "mock-secret",
			grant_type: "password",
			password: "mock-password",
			username: "mock-user@somersetft.nhs.uk",
		},
		url: "https://sso.somersetft.nhs.uk/service-auth",
	},
};

const testParams = {
	birthdate: "2018-08-01",
	location: "https://fhir.nhs.uk/Id/ods-organization-code|RH5",
	patient: `https://fhir.nhs.uk/Id/nhs-number|9999999999`,
	practitioner: `https://sider.nhs.uk/auth|testFirstName.testLastName@somersetft.nhs.uk`,
};

describe("Keycloak access token retrieval plugin", () => {
	let server;

	beforeAll(() => {
		nock.disableNetConnect();

		nock("https://sso.somersetft.nhs.uk")
			.defaultReplyHeaders({
				"cache-control": "no-store",
				"content-type": "application/json",
				pragma: "no-cache",
				"strict-transport-security":
					"max-age=31536000; includeSubDomains",
				"referrer-policy": "no-referrer",
				"x-content-type": "nosniff",
				"x-frame-options": "SAMEORIGIN",
				"x-xss-protection": "1;mode=block",
			})
			.replyContentLength()
			.replyDate()
			.persist()
			.post("/service-auth")
			.reply(200, {
				access_token: "mock-access-token-authorised",
				expires_in: 900,
				refresh_expires_in: 1000,
				refresh_token: "mock-refresh-token",
				token_type: "bearer",
				"not-before-policy": 0,
				session_state: "mock-session-state",
				scope: "profile email",
			})
			.post("/token", /subject_token=mock-access-token-authorised/)
			.reply(200, {
				access_token: "mock-access-token",
				expires_in: 900,
				refresh_expires_in: 0,
				token_type: "bearer",
				"not-before-policy": 0,
				session_state: "mock-session-state",
				scope: "profile email",
			});
	});

	beforeEach(() => {
		server = Fastify();

		server.get("/", (req, res) => {
			res.send(req.query);
		});
	});

	afterAll(() => {
		nock.cleanAll();
		nock.enableNetConnect();
	});

	afterEach(async () => {
		await server.close();
	});

	it("Continues if Keycloak options are not defined", async () => {
		await server.register(plugin).ready();

		const response = await server.inject({
			method: "GET",
			url: "/",
			query: testParams,
		});

		expect(JSON.parse(response.payload)).toEqual(testParams);
		expect(response.statusCode).toBe(200);
	});

	it("Returns Keycloak access_token from mock server", async () => {
		await server.register(plugin, testKeycloakConfig).ready();

		const response = await server.inject({
			method: "GET",
			url: "/",
			query: testParams,
		});

		expect(JSON.parse(response.payload)).toEqual({
			...testParams,
			access_token: "mock-access-token",
		});
		expect(response.statusCode).toBe(200);
	});

	it("Continues if Keycloak endpoint config enabled but other options undefined", async () => {
		await server.register(plugin, { enabled: true }).ready();

		const response = await server.inject({
			method: "GET",
			url: "/",
			query: testParams,
		});

		expect(JSON.parse(response.payload)).toEqual(testParams);
		expect(response.statusCode).toBe(200);
	});
});
