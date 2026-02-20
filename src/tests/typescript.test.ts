import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTypeScript } from "../languages/typescript.js";

describe("TypeScript extractor", () => {
  it("extracts class declarations", async () => {
    const source = `
class UserService {
  private name: string = "";
}
`;
    const { nodes, edges } = await parseTypeScript(source, "user.ts");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "UserService");
    assert.equal(nodes[0].kind, "class");
    assert.equal(nodes[0].file, "user.ts");
  });

  it("extracts interface declarations", async () => {
    const source = `
interface User {
  id: number;
  name: string;
}
`;
    const { nodes } = await parseTypeScript(source, "types.ts");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "User");
    assert.equal(nodes[0].kind, "interface");
  });

  it("extracts enum declarations", async () => {
    const source = `
enum Status {
  Active,
  Inactive,
}
`;
    const { nodes } = await parseTypeScript(source, "enums.ts");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Status");
    assert.equal(nodes[0].kind, "enum");
  });

  it("extracts type alias declarations", async () => {
    const source = `
type UserId = string;
`;
    const { nodes } = await parseTypeScript(source, "types.ts");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "UserId");
    assert.equal(nodes[0].kind, "type_alias");
  });

  it("extracts extends edges", async () => {
    const source = `
class Animal {}
class Dog extends Animal {}
`;
    const { nodes, edges } = await parseTypeScript(source, "animals.ts");
    assert.equal(nodes.length, 2);
    const extendsEdge = edges.find(
      (e) => e.from === "Dog" && e.to === "Animal"
    );
    assert.ok(extendsEdge, "Should have Dog -> Animal extends edge");
    assert.equal(extendsEdge!.kind, "extends");
  });

  it("extracts implements edges", async () => {
    const source = `
interface Serializable {
  serialize(): string;
}
class User implements Serializable {
  serialize() { return ""; }
}
`;
    const { nodes, edges } = await parseTypeScript(source, "user.ts");
    assert.equal(nodes.length, 2);
    const implEdge = edges.find(
      (e) => e.from === "User" && e.to === "Serializable"
    );
    assert.ok(implEdge, "Should have User -> Serializable implements edge");
    assert.equal(implEdge!.kind, "implements");
  });

  it("extracts field type edges", async () => {
    const source = `
interface Address {
  street: string;
}
class User {
  address: Address;
}
`;
    const { edges } = await parseTypeScript(source, "user.ts");
    const fieldEdge = edges.find(
      (e) => e.from === "User" && e.to === "Address" && e.kind === "field_type"
    );
    assert.ok(fieldEdge, "Should have User -> Address field_type edge");
  });

  it("extracts method parameter type edges", async () => {
    const source = `
class Query {}
class Database {
  execute(query: Query): void {}
}
`;
    const { edges } = await parseTypeScript(source, "db.ts");
    const paramEdge = edges.find(
      (e) =>
        e.from === "Database" && e.to === "Query" && e.kind === "method_param"
    );
    assert.ok(paramEdge, "Should have Database -> Query method_param edge");
  });

  it("extracts method return type edges", async () => {
    const source = `
class Result {}
class Service {
  getResult(): Result { return new Result(); }
}
`;
    const { edges } = await parseTypeScript(source, "svc.ts");
    const returnEdge = edges.find(
      (e) =>
        e.from === "Service" && e.to === "Result" && e.kind === "method_return"
    );
    assert.ok(returnEdge, "Should have Service -> Result method_return edge");
  });

  it("extracts type references from type aliases", async () => {
    const source = `
interface Foo {}
interface Bar {}
type Combined = Foo | Bar;
`;
    const { nodes, edges } = await parseTypeScript(source, "types.ts");
    assert.equal(nodes.length, 3);
    const fooEdge = edges.find(
      (e) => e.from === "Combined" && e.to === "Foo"
    );
    const barEdge = edges.find(
      (e) => e.from === "Combined" && e.to === "Bar"
    );
    assert.ok(fooEdge, "Should have Combined -> Foo edge");
    assert.ok(barEdge, "Should have Combined -> Bar edge");
  });

  it("handles multiple interfaces in one file", async () => {
    const source = `
interface A { x: number; }
interface B { y: string; }
interface C { a: A; b: B; }
`;
    const { nodes, edges } = await parseTypeScript(source, "multi.ts");
    assert.equal(nodes.length, 3);
    assert.equal(
      edges.filter((e) => e.from === "C").length,
      2,
      "C should have 2 outgoing edges"
    );
  });

  it("handles interface property signatures", async () => {
    const source = `
interface Config {}
interface App {
  config: Config;
}
`;
    const { edges } = await parseTypeScript(source, "app.ts");
    const edge = edges.find(
      (e) => e.from === "App" && e.to === "Config" && e.kind === "field_type"
    );
    assert.ok(edge, "Should have App -> Config field_type from property signature");
  });

  it("parses TSX files", async () => {
    const source = `
interface Props {
  name: string;
}
class MyComponent {
  props: Props;
  render() { return <div />; }
}
`;
    const { nodes, edges } = await parseTypeScript(source, "comp.tsx");
    assert.equal(nodes.length, 2);
    const edge = edges.find((e) => e.from === "MyComponent" && e.to === "Props");
    assert.ok(edge, "Should extract edges from TSX files");
  });
});
