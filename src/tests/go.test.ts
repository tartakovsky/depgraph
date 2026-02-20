import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGo } from "../languages/go.js";

describe("Go extractor", () => {
  it("extracts struct declarations", async () => {
    const source = `
package main

type UserService struct {
  Name string
}
`;
    const { nodes } = await parseGo(source, "user.go");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "UserService");
    assert.equal(nodes[0].kind, "class");
    assert.equal(nodes[0].file, "user.go");
  });

  it("extracts interface declarations", async () => {
    const source = `
package main

type Repository interface {
  Save()
}
`;
    const { nodes } = await parseGo(source, "repo.go");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "Repository");
    assert.equal(nodes[0].kind, "interface");
  });

  it("extracts struct embedding as extends", async () => {
    const source = `
package main

type Animal struct {}
type Dog struct {
  Animal
}
`;
    const { nodes, edges } = await parseGo(source, "animals.go");
    assert.equal(nodes.length, 2);
    const edge = edges.find((e) => e.from === "Dog" && e.to === "Animal");
    assert.ok(edge, "Should have Dog -> Animal extends edge");
    assert.equal(edge!.kind, "extends");
  });

  it("extracts pointer embedding as extends", async () => {
    const source = `
package main

type Base struct {}
type Child struct {
  *Base
}
`;
    const { edges } = await parseGo(source, "embed.go");
    const edge = edges.find((e) => e.from === "Child" && e.to === "Base");
    assert.ok(edge, "Should have Child -> Base extends edge from pointer embedding");
    assert.equal(edge!.kind, "extends");
  });

  it("extracts interface embedding as extends", async () => {
    const source = `
package main

type Reader interface {
  Read()
}
type Writer interface {
  Write()
}
type ReadWriter interface {
  Reader
  Writer
}
`;
    const { nodes, edges } = await parseGo(source, "io.go");
    assert.equal(nodes.length, 3);
    const readerEdge = edges.find((e) => e.from === "ReadWriter" && e.to === "Reader");
    const writerEdge = edges.find((e) => e.from === "ReadWriter" && e.to === "Writer");
    assert.ok(readerEdge, "Should have ReadWriter -> Reader");
    assert.ok(writerEdge, "Should have ReadWriter -> Writer");
  });

  it("extracts field type edges", async () => {
    const source = `
package main

type Address struct {}
type User struct {
  Addr Address
}
`;
    const { edges } = await parseGo(source, "user.go");
    const edge = edges.find(
      (e) => e.from === "User" && e.to === "Address" && e.kind === "field_type"
    );
    assert.ok(edge, "Should have User -> Address field_type edge");
  });

  it("extracts pointer field type edges", async () => {
    const source = `
package main

type Config struct {}
type App struct {
  Cfg *Config
}
`;
    const { edges } = await parseGo(source, "app.go");
    const edge = edges.find(
      (e) => e.from === "App" && e.to === "Config" && e.kind === "field_type"
    );
    assert.ok(edge, "Should have App -> Config field_type edge through pointer");
  });

  it("extracts method parameter types from method declarations", async () => {
    const source = `
package main

type Request struct {}
type Service struct {}

func (s *Service) Handle(req Request) {}
`;
    const { edges } = await parseGo(source, "svc.go");
    const edge = edges.find(
      (e) => e.from === "Service" && e.to === "Request" && e.kind === "method_param"
    );
    assert.ok(edge, "Should have Service -> Request method_param edge");
  });

  it("extracts method return types from method declarations", async () => {
    const source = `
package main

type Result struct {}
type Service struct {}

func (s *Service) Process() Result { return Result{} }
`;
    const { edges } = await parseGo(source, "svc.go");
    const edge = edges.find(
      (e) => e.from === "Service" && e.to === "Result" && e.kind === "method_return"
    );
    assert.ok(edge, "Should have Service -> Result method_return edge");
  });

  it("extracts interface method parameter and return types", async () => {
    const source = `
package main

type Query struct {}
type Result struct {}
type Database interface {
  Execute(q Query) Result
}
`;
    const { edges } = await parseGo(source, "db.go");
    const paramEdge = edges.find(
      (e) => e.from === "Database" && e.to === "Query" && e.kind === "method_param"
    );
    const returnEdge = edges.find(
      (e) => e.from === "Database" && e.to === "Result" && e.kind === "method_return"
    );
    assert.ok(paramEdge, "Should have Database -> Query method_param edge");
    assert.ok(returnEdge, "Should have Database -> Result method_return edge");
  });

  it("ignores builtin types", async () => {
    const source = `
package main

type User struct {
  Name string
  Age  int
  Active bool
}
`;
    const { edges } = await parseGo(source, "user.go");
    assert.equal(edges.length, 0, "Should have no edges to builtin types");
  });

  it("handles multiple types in one file", async () => {
    const source = `
package main

type Fetcher interface {}
type APIClient struct {}
type Cache struct {}
`;
    const { nodes } = await parseGo(source, "net.go");
    assert.equal(nodes.length, 3);
    const names = nodes.map((n) => n.name).sort();
    assert.deepEqual(names, ["APIClient", "Cache", "Fetcher"]);
  });
});
