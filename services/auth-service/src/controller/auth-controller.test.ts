import { test, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { login } from "./auth-controller.js";

const PASSWORD = "correct-horse-battery-staple";

before(() => {
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);
  process.env.JWT_SECRET = "test-secret";
});

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("login: rejects missing credentials", async () => {
  const res = mockRes();
  await login({ body: {} } as any, res);
  assert.strictEqual(res.statusCode, 400);
});

test("login: rejects an unknown username", async () => {
  const res = mockRes();
  await login({ body: { username: "nobody", password: PASSWORD } } as any, res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.message, "Invalid credentials");
});

test("login: rejects the correct username with the wrong password", async () => {
  const res = mockRes();
  await login({ body: { username: "admin", password: "wrong" } } as any, res);
  assert.strictEqual(res.statusCode, 401);
});

test("login: issues a valid JWT for correct credentials", async () => {
  const res = mockRes();
  await login({ body: { username: "admin", password: PASSWORD } } as any, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.token, "expected a token in the response body");

  const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
  assert.strictEqual(decoded.sub, "admin");
  assert.strictEqual(decoded.role, "admin");
});
