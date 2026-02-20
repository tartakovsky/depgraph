import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSwift } from "../languages/swift.js";

describe("Swift extractor", () => {
  it("extracts class declarations", async () => {
    const source = `
class UserService {
  var name: String = ""
}
`;
    const { nodes } = await parseSwift(source, "User.swift");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "UserService");
    assert.equal(nodes[0].kind, "class");
  });

  it("extracts protocol declarations", async () => {
    const source = `
protocol Repository {
  func save()
}
`;
    const { nodes } = await parseSwift(source, "Repository.swift");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Repository");
    assert.equal(nodes[0].kind, "protocol");
  });

  it("extracts enum declarations", async () => {
    const source = `
enum Status {
  case active
  case inactive
}
`;
    const { nodes } = await parseSwift(source, "Status.swift");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Status");
    assert.equal(nodes[0].kind, "enum");
  });

  it("extracts inheritance edges from classes", async () => {
    const source = `
class Animal {}
class Dog: Animal {}
`;
    const { nodes, edges } = await parseSwift(source, "Animals.swift");
    assert.equal(nodes.length, 2);
    const edge = edges.find((e) => e.from === "Dog" && e.to === "Animal");
    assert.ok(edge, "Should have Dog -> Animal edge");
  });

  it("extracts protocol conformance from extensions", async () => {
    const source = `
class User {}
protocol Codable {}
extension User: Codable {}
`;
    const { nodes, edges } = await parseSwift(source, "User.swift");
    const userNode = nodes.find((n) => n.name === "User");
    assert.ok(userNode, "Should have User node");
    const edge = edges.find(
      (e) => e.from === "User" && e.to === "Codable"
    );
    assert.ok(edge, "Should have User -> Codable implements edge from extension");
  });

  it("extracts multiple types from one file", async () => {
    const source = `
protocol Fetchable {}
class APIClient {}
enum NetworkError {}
`;
    const { nodes } = await parseSwift(source, "Network.swift");
    assert.equal(nodes.length, 3);
    const names = nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ["APIClient", "Fetchable", "NetworkError"]);
  });
});
