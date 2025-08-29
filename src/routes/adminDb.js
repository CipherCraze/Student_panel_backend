import express from 'express'
import mongoose from 'mongoose'
import { protect, requireSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

// List collections
router.get('/collections', protect, requireSuperAdmin, async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray()
    const names = collections.map((c) => c.name).sort()
    res.json({ success: true, collections: names })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list collections', error: error.message })
  }
})

// Query documents with pagination and basic filters
router.get('/:collection', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { collection } = req.params
    const { page = 1, limit = 20, q = '', where = '' } = req.query

    const col = mongoose.connection.collection(collection)

    let filter = {}
    if (where) {
      try {
        const parsed = JSON.parse(String(where))
        if (parsed && typeof parsed === 'object') filter = { ...filter, ...parsed }
      } catch (_) {}
    }
    if (q) {
      // crude text search across common fields
      const regex = new RegExp(String(q), 'i')
      filter.$or = [
        { name: regex },
        { title: regex },
        { email: regex },
        { type: regex },
        { status: regex },
      ]
    }

    const docs = await col
      .find(filter)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .sort({ _id: -1 })
      .toArray()

    const total = await col.countDocuments(filter)
    res.json({ success: true, data: docs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch documents', error: error.message })
  }
})

// Get single document by id
router.get('/:collection/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { collection, id } = req.params
    const col = mongoose.connection.collection(collection)
    const _id = new mongoose.Types.ObjectId(id)
    const doc = await col.findOne({ _id })
    if (!doc) return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true, data: doc })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch document', error: error.message })
  }
})

// Create document
router.post('/:collection', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { collection } = req.params
    const col = mongoose.connection.collection(collection)
    const result = await col.insertOne(req.body)
    res.status(201).json({ success: true, insertedId: result.insertedId })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create document', error: error.message })
  }
})

// Update document by id
router.put('/:collection/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { collection, id } = req.params
    const col = mongoose.connection.collection(collection)
    const _id = new mongoose.Types.ObjectId(id)
    const { value } = await col.findOneAndUpdate({ _id }, { $set: req.body }, { returnDocument: 'after' })
    if (!value) return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true, data: value })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update document', error: error.message })
  }
})

// Delete document by id
router.delete('/:collection/:id', protect, requireSuperAdmin, async (req, res) => {
  try {
    const { collection, id } = req.params
    const col = mongoose.connection.collection(collection)
    const _id = new mongoose.Types.ObjectId(id)
    const result = await col.deleteOne({ _id })
    if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete document', error: error.message })
  }
})

export default router
