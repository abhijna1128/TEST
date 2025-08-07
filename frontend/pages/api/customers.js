import mysql from "mysql2/promise";

export default async function handler(req, res) {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    // GET all customers or single customer by ID
    if (req.method === "GET") {
      // Check if id is provided in query params
      const { id } = req.query;

      if (id) {
        // Get single customer by ID
        const [rows] = await connection.execute(
          "SELECT cid, cname, cphone, location, status, remark FROM customer WHERE cid = ?",
          [id]
        );

        if (rows.length === 0) {
          return res.status(404).json({ error: "Customer not found" });
        }

        return res.status(200).json(rows[0]);
      } else {
        // Get all customers (existing behavior)
        const [rows] = await connection.execute(
          "SELECT cid, cname, cphone, location, status, remark FROM customer"
        );
        return res.status(200).json({ customers: rows });
      }
    }

    // POST new customer
    if (req.method === "POST") {
      const { cname, cphone, location, status, remark } = req.body;

      if (!cname || !cphone || !location) {
        return res
          .status(400)
          .json({ error: "Name, phone, and location are required" });
      }

      const [result] = await connection.execute(
        "INSERT INTO customer (cname, cphone, location, status, remark) VALUES (?, ?, ?, ?, ?)",
        [cname, cphone, location, status || "lead", remark || null]
      );

      const [newCustomer] = await connection.execute(
        "SELECT * FROM customer WHERE cid = ?",
        [result.insertId]
      );

      return res.status(201).json(newCustomer[0]);
    }

    // PUT update customer
    if (req.method === "PUT") {
      const { cid } = req.query;
      const updates = req.body;

      if (!cid)
        return res.status(400).json({ error: "Customer ID is required" });

      const [existing] = await connection.execute(
        "SELECT * FROM customer WHERE cid = ?",
        [cid]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const mergedData = { ...existing[0], ...updates };
      await connection.execute(
        "UPDATE customer SET cname = ?, cphone = ?, location = ?, status = ?, remark = ? WHERE cid = ?",
        [
          mergedData.cname,
          mergedData.cphone,
          mergedData.location,
          mergedData.status || "lead",
          mergedData.remark || null,
          cid,
        ]
      );

      return res.status(200).json(mergedData);
    }

    // DELETE customer
    if (req.method === "DELETE") {
      const { cid } = req.query;

      if (!cid) {
        return res.status(400).json({ error: "Customer ID is required" });
      }

      const [existing] = await connection.execute(
        "SELECT * FROM customer WHERE cid = ?",
        [cid]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }

      try {
        // Start a transaction
        await connection.beginTransaction();

        // First, delete related invoices
        const [deleteInvoicesResult] = await connection.execute(
          "DELETE FROM invoices WHERE cid = ?",
          [cid]
        );

        const deletedInvoicesCount = deleteInvoicesResult.affectedRows;

        // Then delete the customer
        const [deleteCustomerResult] = await connection.execute(
          "DELETE FROM customer WHERE cid = ?",
          [cid]
        );

        // Commit the transaction
        await connection.commit();

        return res.status(200).json({
          message: "Customer deleted successfully",
          deletedInvoices: deletedInvoicesCount,
          customerDeleted: deleteCustomerResult.affectedRows > 0,
        });
      } catch (error) {
        // Rollback the transaction in case of error
        await connection.rollback();

        console.error("Delete error:", error);
        return res.status(500).json({
          error: "Failed to delete customer",
          details: error.message,
        });
      }
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    await connection.end();
  }
}
