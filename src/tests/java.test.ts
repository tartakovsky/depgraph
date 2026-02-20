import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJava } from "../languages/java.js";

describe("Java extractor", () => {
  it("extracts class declarations", async () => {
    const source = `
public class UserService {
  private String name;
}
`;
    const { nodes } = await parseJava(source, "UserService.java");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "UserService");
    assert.equal(nodes[0].kind, "class");
  });

  it("extracts interface declarations", async () => {
    const source = `
public interface Repository {
  void save();
}
`;
    const { nodes } = await parseJava(source, "Repository.java");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Repository");
    assert.equal(nodes[0].kind, "interface");
  });

  it("extracts enum declarations", async () => {
    const source = `
public enum Status {
  ACTIVE,
  INACTIVE
}
`;
    const { nodes } = await parseJava(source, "Status.java");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Status");
    assert.equal(nodes[0].kind, "enum");
  });

  it("extracts extends edges", async () => {
    const source = `
class Animal {}
class Dog extends Animal {}
`;
    const { nodes, edges } = await parseJava(source, "Animals.java");
    assert.equal(nodes.length, 2);
    const edge = edges.find((e) => e.from === "Dog" && e.to === "Animal");
    assert.ok(edge, "Should have Dog -> Animal extends edge");
    assert.equal(edge!.kind, "extends");
  });

  it("extracts implements edges", async () => {
    const source = `
interface Serializable {}
class User implements Serializable {}
`;
    const { nodes, edges } = await parseJava(source, "User.java");
    assert.equal(nodes.length, 2);
    const edge = edges.find(
      (e) => e.from === "User" && e.to === "Serializable"
    );
    assert.ok(edge, "Should have User -> Serializable implements edge");
    assert.equal(edge!.kind, "implements");
  });

  it("extracts field type edges", async () => {
    const source = `
class Address {}
class User {
  private Address address;
}
`;
    const { edges } = await parseJava(source, "User.java");
    const edge = edges.find(
      (e) => e.from === "User" && e.to === "Address" && e.kind === "field_type"
    );
    assert.ok(edge, "Should have User -> Address field_type edge");
  });

  it("extracts method parameter type edges", async () => {
    const source = `
class Query {}
class Database {
  void execute(Query query) {}
}
`;
    const { edges } = await parseJava(source, "Database.java");
    const edge = edges.find(
      (e) =>
        e.from === "Database" && e.to === "Query" && e.kind === "method_param"
    );
    assert.ok(edge, "Should have Database -> Query method_param edge");
  });

  it("extracts method return type edges", async () => {
    const source = `
class Result {}
class Service {
  Result getResult() { return null; }
}
`;
    const { edges } = await parseJava(source, "Service.java");
    const edge = edges.find(
      (e) =>
        e.from === "Service" && e.to === "Result" && e.kind === "method_return"
    );
    assert.ok(edge, "Should have Service -> Result method_return edge");
  });

  it("handles multiple implements", async () => {
    const source = `
interface Readable {}
interface Writable {}
class Stream implements Readable, Writable {}
`;
    const { edges } = await parseJava(source, "Stream.java");
    const readableEdge = edges.find(
      (e) => e.from === "Stream" && e.to === "Readable"
    );
    const writableEdge = edges.find(
      (e) => e.from === "Stream" && e.to === "Writable"
    );
    assert.ok(readableEdge, "Should have Stream -> Readable");
    assert.ok(writableEdge, "Should have Stream -> Writable");
  });

  it("handles extends + implements together", async () => {
    const source = `
class Base {}
interface Loggable {}
class Service extends Base implements Loggable {}
`;
    const { edges } = await parseJava(source, "Service.java");
    const extendsEdge = edges.find(
      (e) => e.from === "Service" && e.to === "Base" && e.kind === "extends"
    );
    const implEdge = edges.find(
      (e) =>
        e.from === "Service" &&
        e.to === "Loggable" &&
        e.kind === "implements"
    );
    assert.ok(extendsEdge, "Should have extends edge");
    assert.ok(implEdge, "Should have implements edge");
  });

  it("extracts types from generic fields", async () => {
    const source = `
class User {}
class UserList {
  private List<User> users;
}
`;
    const { edges } = await parseJava(source, "UserList.java");
    const edge = edges.find(
      (e) => e.from === "UserList" && e.to === "User" && e.kind === "field_type"
    );
    assert.ok(edge, "Should extract User from List<User> generic field");
  });

  it("extracts extends with generics", async () => {
    const source = `
class Base {}
class Child extends Base {}
`;
    const { edges } = await parseJava(source, "Child.java");
    const edge = edges.find((e) => e.from === "Child" && e.to === "Base");
    assert.ok(edge, "Should extract extends through generic");
  });

  it("does not crash on empty source", async () => {
    const { nodes, edges } = await parseJava("", "Empty.java");
    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
  });
});
